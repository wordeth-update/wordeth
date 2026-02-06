const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const UsageEvent = require('../models/UsageEvent');

function getS3Client() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
  }

  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function getBucket() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET not configured');
  return bucket;
}

function getArchiveKey(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `wordeth-analytics/${year}/${month}/${day}.json`;
}

async function aggregateDaySummary(dateStr) {
  const dayStart = new Date(dateStr + 'T00:00:00.000Z');
  const dayEnd = new Date(dateStr + 'T23:59:59.999Z');

  const [segmentCounts, eventTypeCounts, genreCounts, uniqueUsers, totalEvents] = await Promise.all([
    UsageEvent.aggregate([
      { $match: { timestamp: { $gte: dayStart, $lte: dayEnd } } },
      { $group: { _id: '$segment', count: { $sum: 1 } } }
    ]),
    UsageEvent.aggregate([
      { $match: { timestamp: { $gte: dayStart, $lte: dayEnd } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ]),
    UsageEvent.aggregate([
      { $match: { timestamp: { $gte: dayStart, $lte: dayEnd }, 'metadata.genre': { $exists: true, $ne: null } } },
      { $group: { _id: '$metadata.genre', count: { $sum: 1 } } }
    ]),
    UsageEvent.distinct('sessionId', { timestamp: { $gte: dayStart, $lte: dayEnd }, sessionId: { $ne: null } }),
    UsageEvent.countDocuments({ timestamp: { $gte: dayStart, $lte: dayEnd } })
  ]);

  const merchEvents = await UsageEvent.aggregate([
    { $match: { timestamp: { $gte: dayStart, $lte: dayEnd }, segment: 'merch' } },
    { $group: {
      _id: null,
      totalOrders: { $sum: { $cond: [{ $eq: ['$eventType', 'merch_order'] }, 1, 0] } },
      totalRevenue: { $sum: { $ifNull: ['$metadata.orderValue', 0] } },
      browseCount: { $sum: { $cond: [{ $eq: ['$eventType', 'merch_browse'] }, 1, 0] } },
      designCount: { $sum: { $cond: [{ $eq: ['$eventType', 'merch_create_design'] }, 1, 0] } }
    }}
  ]);

  const communityEvents = await UsageEvent.aggregate([
    { $match: { timestamp: { $gte: dayStart, $lte: dayEnd }, segment: 'community' } },
    { $group: {
      _id: null,
      joins: { $sum: { $cond: [{ $eq: ['$eventType', 'verse_join'] }, 1, 0] } },
      leaves: { $sum: { $cond: [{ $eq: ['$eventType', 'verse_leave'] }, 1, 0] } },
      avgDuration: { $avg: { $ifNull: ['$metadata.duration', 0] } },
      uniqueRooms: { $addToSet: '$metadata.roomId' }
    }}
  ]);

  const segments = {};
  segmentCounts.forEach(s => { segments[s._id] = s.count; });

  const eventTypes = {};
  eventTypeCounts.forEach(e => { eventTypes[e._id] = e.count; });

  const genres = {};
  genreCounts.forEach(g => { genres[g._id] = g.count; });

  const merch = merchEvents[0] || { totalOrders: 0, totalRevenue: 0, browseCount: 0, designCount: 0 };
  const community = communityEvents[0] || { joins: 0, leaves: 0, avgDuration: 0, uniqueRooms: [] };

  return {
    date: dateStr,
    archivedAt: new Date().toISOString(),
    totalEvents,
    uniqueSessions: uniqueUsers.length,
    segments,
    eventTypes,
    genres,
    merch: {
      orders: merch.totalOrders,
      revenue: Math.round(merch.totalRevenue * 100) / 100,
      browses: merch.browseCount,
      designs: merch.designCount,
      aov: merch.totalOrders > 0 ? Math.round((merch.totalRevenue / merch.totalOrders) * 100) / 100 : 0
    },
    community: {
      joins: community.joins,
      leaves: community.leaves,
      avgSessionMinutes: Math.round((community.avgDuration || 0) / 60),
      uniqueRooms: (community.uniqueRooms || []).length
    }
  };
}

async function archiveDay(dateStr) {
  const summary = await aggregateDaySummary(dateStr);
  if (summary.totalEvents === 0) {
    return { skipped: true, date: dateStr, reason: 'No events for this day' };
  }

  const s3 = getS3Client();
  const key = getArchiveKey(dateStr);

  await s3.send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: JSON.stringify(summary, null, 2),
    ContentType: 'application/json'
  }));

  return { success: true, date: dateStr, totalEvents: summary.totalEvents, key };
}

async function archiveRange(startDate, endDate) {
  const results = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const result = await archiveDay(dateStr);
      results.push(result);
    } catch (err) {
      results.push({ error: true, date: dateStr, message: err.message });
    }
    current.setDate(current.getDate() + 1);
  }
  return results;
}

async function archiveOldData(daysOld = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const oldestEvent = await UsageEvent.findOne().sort({ timestamp: 1 }).lean();
  if (!oldestEvent) return { message: 'No events to archive' };

  const startDate = oldestEvent.timestamp.toISOString().split('T')[0];
  const endDate = cutoff.toISOString().split('T')[0];

  if (startDate > endDate) return { message: 'No events old enough to archive' };

  return archiveRange(startDate, endDate);
}

async function getArchivedSummary(dateStr) {
  try {
    const s3 = getS3Client();
    const key = getArchiveKey(dateStr);

    const response = await s3.send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: key
    }));

    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function getArchivedRange(startDate, endDate) {
  const summaries = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    try {
      const summary = await getArchivedSummary(dateStr);
      if (summary) summaries.push(summary);
    } catch (err) {
      // skip errors for individual days
    }
    current.setDate(current.getDate() + 1);
  }
  return summaries;
}

async function listArchivedMonths() {
  const s3 = getS3Client();
  const prefix = 'wordeth-analytics/';

  const response = await s3.send(new ListObjectsV2Command({
    Bucket: getBucket(),
    Prefix: prefix,
    Delimiter: ''
  }));

  const months = new Set();
  (response.Contents || []).forEach(obj => {
    const parts = obj.Key.replace(prefix, '').split('/');
    if (parts.length >= 2) {
      months.add(`${parts[0]}-${parts[1]}`);
    }
  });

  return Array.from(months).sort();
}

async function getMonthSummary(yearMonth) {
  const [year, month] = yearMonth.split('-');
  const startDate = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const dailySummaries = await getArchivedRange(startDate, endDate);

  if (dailySummaries.length === 0) return null;

  const aggregated = {
    month: yearMonth,
    daysWithData: dailySummaries.length,
    totalEvents: 0,
    totalSessions: 0,
    segments: {},
    genres: {},
    merch: { orders: 0, revenue: 0, browses: 0, designs: 0 },
    community: { joins: 0, uniqueRooms: 0, totalSessionMinutes: 0 },
    dailyBreakdown: []
  };

  let totalWeightedMinutes = 0;
  let totalJoinsForAvg = 0;

  dailySummaries.forEach(day => {
    aggregated.totalEvents += day.totalEvents;
    aggregated.totalSessions += day.uniqueSessions;

    Object.entries(day.segments || {}).forEach(([seg, count]) => {
      aggregated.segments[seg] = (aggregated.segments[seg] || 0) + count;
    });

    Object.entries(day.genres || {}).forEach(([genre, count]) => {
      aggregated.genres[genre] = (aggregated.genres[genre] || 0) + count;
    });

    if (day.merch) {
      aggregated.merch.orders += day.merch.orders;
      aggregated.merch.revenue += day.merch.revenue;
      aggregated.merch.browses += day.merch.browses;
      aggregated.merch.designs += day.merch.designs;
    }

    if (day.community) {
      aggregated.community.joins += day.community.joins;
      const dayJoins = day.community.joins || 0;
      if (dayJoins > 0) {
        totalWeightedMinutes += (day.community.avgSessionMinutes || 0) * dayJoins;
        totalJoinsForAvg += dayJoins;
      }
    }

    aggregated.dailyBreakdown.push({
      date: day.date,
      events: day.totalEvents,
      sessions: day.uniqueSessions
    });
  });

  aggregated.community.avgSessionMinutes = totalJoinsForAvg > 0
    ? Math.round(totalWeightedMinutes / totalJoinsForAvg)
    : 0;
  aggregated.community.uniqueRooms = new Set(
    dailySummaries.flatMap(d => d.community?.roomIds || [])
  ).size || dailySummaries.reduce((sum, d) => sum + (d.community?.uniqueRooms || 0), 0);

  aggregated.merch.revenue = Math.round(aggregated.merch.revenue * 100) / 100;
  aggregated.merch.aov = aggregated.merch.orders > 0
    ? Math.round((aggregated.merch.revenue / aggregated.merch.orders) * 100) / 100
    : 0;

  return aggregated;
}

function isConfigured() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET);
}

module.exports = {
  archiveDay,
  archiveRange,
  archiveOldData,
  getArchivedSummary,
  getArchivedRange,
  listArchivedMonths,
  getMonthSummary,
  aggregateDaySummary,
  isConfigured
};
