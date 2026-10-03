#!/bin/zsh
# Wordeth backend check. READ-ONLY: it looks, it never changes anything.
#
#   scripts/ops/check.sh            one snapshot: health, deploy, rooms, memory, errors
#   scripts/ops/check.sh room       who is in each live room and whether their audio passes are being issued
#   scripts/ops/check.sh watch 15   sample once a minute for 15 minutes; stops early and says why if something breaks
#   scripts/ops/check.sh secrets    confirm the sensitive paths are refused from outside
#
# Needs the Railway CLI, logged in and linked to the Wordeth project
# (railway link -p striking-curiosity -e production), and python3.
# Never prints a secret: variables are checked by NAME only.

SITE="https://www.wordeth.com"
SERVICE="wordeth"
cd "$(dirname "$0")/../.." || exit 1
MODE="${1:-status}"

rooms() {
  # Avatars can be megabytes of base64; never print them.
  curl -s -m 15 "$SITE/api/rooms/active" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); r=d if isinstance(d,list) else d.get('rooms',[])
except Exception:
    print('  could not read the rooms list'); raise SystemExit
print('  live rooms:', len(r))
for x in r:
    print('  -', x.get('name'), '| people', x.get('participantCount'), '| price', x.get('tokenPrice'), '| id', x.get('id'))
    for p in x.get('participants',[]):
        a=p.get('avatar') or ''
        print('      ', p.get('userName'), '(host)' if p.get('isHost') else '', '| avatar bytes', len(a))
"
}

metrics() {
  railway metrics --service $SERVICE --since "${1:-1h}" --json 2>/dev/null | python3 -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: print('  could not read metrics'); raise SystemExit
m=d['memory']; h=d['http']; c=d['cpu']
print('  memory MB now/avg/max: %d / %d / %d' % (m['current_mb'], m['average_mb'], m['max_mb']))
print('  cpu max: %.3f vCPU' % c['max'])
print('  requests: %d total | 2xx %d | 4xx %d | 5xx %d | p95 %sms' % (h['total'], h['2xx'], h['4xx'], h['5xx'], h.get('p95_ms')))
print('  latest deploy:', d['deployments'][0]['created_at'][:19], d['deployments'][0]['status'], d['deployments'][0]['id'])
"
}

case "$MODE" in
status)
  echo "== health"; for i in 1 2 3; do curl -s -m 10 -o /dev/null -w "  %{http_code} in %{time_total}s\n" "$SITE/api/health"; done
  echo "== deploys (a deploy restarts the server)"; railway deployment list --service $SERVICE 2>&1 | sed -n 2,4p
  echo "== last hour"; metrics 1h
  echo "== rooms"; rooms
  echo "== settings present (names only)"
  railway variables --service $SERVICE --json 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k in ['REDIS_URL','RESEND_API_KEY','EMAIL_FROM','AUDD_API_TOKEN','STRIPE_WEBHOOK_SECRET','AGORA_APP_ID','MUSIXMATCH_API_KEY']:
    print('  %-22s %s' % (k, 'set' if k in d else 'MISSING'))"
  echo "== server log: errors and restarts (last 300 lines)"
  railway logs --service $SERVICE -n 300 2>/dev/null | grep -i -E "error|unhandled|uncaught|Starting Container|SIGTERM|out of memory|No REDIS_URL" | grep -v -i "idle timeout" | tail -8 | cut -c1-170
  echo "== refused or failed requests, last 15 minutes (top paths)"
  railway logs --service $SERVICE --http --since 15m -n 3000 2>/dev/null | awk '$4 ~ /^[45]/ {print $2, $3, $4}' | sed -E 's#/[0-9a-f]{24}#/:id#g' | sort | uniq -c | sort -rn | head -8
  ;;
room)
  echo "== rooms"; rooms
  railway logs --service $SERVICE --since 10m -n 800 2>/dev/null > /tmp/wordeth-ops-app.txt
  echo "== audio passes issued, last 10 minutes (role 1 = may speak, role 2 = listen only)"
  grep "Agora token generated" /tmp/wordeth-ops-app.txt | sed -E 's/.*uid=([0-9]+), role=([0-9]).*/  uid \1 role \2/' | sort | uniq -c
  echo "== joins, leaves and stage changes, last 10 minutes"
  grep -i -E "joined room|left room|Dedup|promot|speaker|stage" /tmp/wordeth-ops-app.txt | cut -c1-140 | tail -14
  railway logs --service $SERVICE --http --since 10m -n 3000 2>/dev/null > /tmp/wordeth-ops-http.txt
  echo "== audio pass requests by result (anything but 200 is a refusal)"
  awk '$3=="/api/agora/token" {print "  " $4}' /tmp/wordeth-ops-http.txt | sort | uniq -c
  echo "== connections closed (short ones in a burst mean phones are reconnecting)"
  awk '$3=="/socket.io/" {gsub("ms","",$5); if ($5+0<60000) s++; else l++} END {printf "  under a minute: %d   longer: %d\n", s, l}' /tmp/wordeth-ops-http.txt
  rm -f /tmp/wordeth-ops-app.txt /tmp/wordeth-ops-http.txt
  ;;
watch)
  MINUTES="${2:-15}"; DEPLOY0=$(railway metrics --service $SERVICE --since 5m --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['deployments'][0]['id'])" 2>/dev/null)
  fails=0
  for i in $(seq 1 $MINUTES); do
    h=$(curl -s -m 10 -o /dev/null -w "%{http_code} %{time_total}" "$SITE/api/health"); code=${h%% *}
    r=$(curl -s -m 10 "$SITE/api/rooms/active" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); r=d if isinstance(d,list) else d.get('rooms',[]); print(len(r), 'rooms,', sum(int(x.get('participantCount') or 0) for x in r), 'people')
except Exception: print('rooms ?')")
    m=$(railway metrics --service $SERVICE --since 5m --json 2>/dev/null | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print(round(d['memory']['current_mb']), d['http']['5xx'], d['http']['4xx'], d['http']['total'], d['deployments'][0]['id'])
except Exception: print('? ? ? ? ?')")
    mem=$(echo $m | cut -d' ' -f1); s5=$(echo $m | cut -d' ' -f2); dep=$(echo $m | cut -d' ' -f5)
    echo "$(date +%H:%M:%S) health $h s | $r | memory ${mem} MB | last 5 min: 5xx $s5, 4xx $(echo $m | cut -d' ' -f3) of $(echo $m | cut -d' ' -f4)"
    [ "$code" != "200" ] && fails=$((fails+1)) || fails=0
    [ $fails -ge 2 ] && { echo "STOPPED: the health check failed twice in a row"; exit 3; }
    [ -n "$DEPLOY0" ] && [ "$dep" != "?" ] && [ "$dep" != "$DEPLOY0" ] && { echo "STOPPED: the server was redeployed ($dep), which restarts it"; exit 3; }
    [ "$s5" != "?" ] && [ "$s5" -gt 0 ] 2>/dev/null && { echo "STOPPED: the server returned errors (5xx)"; exit 3; }
    [ "$mem" != "?" ] && [ "$mem" -gt 1500 ] 2>/dev/null && { echo "STOPPED: memory at ${mem} MB"; exit 3; }
    [ $i -lt $MINUTES ] && sleep 55
  done
  ;;
secrets)
  echo "== these must all be refused (404)"
  for p in /.env /.env.local /.git/config /package.json /server.js /config.json /.aws/credentials /api/.env; do
    printf "  %-20s %s\n" $p "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$SITE$p")"
  done
  ;;
*) echo "usage: check.sh [status|room|watch MINUTES|secrets]"; exit 1;;
esac
