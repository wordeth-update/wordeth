/**
 * A dropped connection must not hand somebody else the room.
 *
 * A tester joined a room they had not opened and found the host's controls —
 * lock the room, toggle karaoke — available to them. The server reassigned
 * the host the instant the host's socket dropped, and phones drop sockets
 * constantly: the screen locks, the app backgrounds, Wi-Fi hands to cellular.
 *
 * This drives the real signaling module over real sockets with real accounts.
 * It lives outside the jest suite because jest's harness will not hold a
 * websocket open here, and because it needs MongoDB running.
 *
 *   docker start carosene-mongo
 *   node tests/manual/host-handover.js
 *
 * Checked against the pre-fix code, where it fails exactly where it should.
 */
process.env.NODE_ENV='test';
process.env.JWT_SECRET='test-secret-key-that-is-long-enough-for-validation-64-chars-min';
process.env.MONGODB_URI='mongodb://127.0.0.1:27017/wordeth_hostcheck?directConnection=true';
const http=require('http');
const {Server}=require('socket.io');
const Client=require('socket.io-client');
const {setupSignaling,getRoomsMap}=require('../../routes/signaling');
const mongoose=require('mongoose');
const jwt=require('jsonwebtoken');

const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const results=[];
function check(name, pass, detail){ results.push({name,pass,detail}); console.log((pass?'  PASS  ':'  FAIL  ')+name+(detail?'  ('+detail+')':'')); }

(async()=>{
  // Opening a room requires a signed-in account, so make two real ones.
  await mongoose.connect(process.env.MONGODB_URI);
  const User=require('../../models/User');
  await User.deleteMany({email:{$in:['hh-host@test.local','hh-visitor@test.local']}});
  const hostUser=await new User({name:'Host',email:'hh-host@test.local',password:'HostPass123!',agreedToTerms:true}).save();
  const visitorUser=await new User({name:'Visitor',email:'hh-visitor@test.local',password:'VisitPass123!',agreedToTerms:true}).save();
  const tokenFor=(u)=>jwt.sign({userId:u._id,role:u.role},process.env.JWT_SECRET,{expiresIn:'1h'});
  const HOST_TOKEN=tokenFor(hostUser), VISITOR_TOKEN=tokenFor(visitorUser);
  const HOST_ID=String(hostUser._id), VISITOR_ID=String(visitorUser._id);

  const srv=http.createServer(); const io=new Server(srv,{cors:{origin:'*'}});
  setupSignaling(io);
  await new Promise(r=>srv.listen(0,r));
  const port=srv.address().port;
  const conn=()=>new Client('http://localhost:'+port,{transports:['websocket'],forceNew:true});
  const joined=(s,p)=>new Promise(res=>s.emit('join-room',p,res));

  // ---- Scenario 1: the host's connection drops -----------------------------
  const roomId='check-'+Date.now();
  const host=conn(); await new Promise(r=>host.on('connect',r));
  const hAck=await joined(host,{roomId,authToken:HOST_TOKEN,isHost:true,roomName:'Check'});
  check('host opens the room and is host', hAck.success===true && hAck.isHost===true);

  const visitor=conn(); await new Promise(r=>visitor.on('connect',r));
  const vAck=await joined(visitor,{roomId,authToken:VISITOR_TOKEN});
  check('visitor joins and is NOT host', vAck.success===true && vAck.isHost===false);

  let handed=false, away=false;
  visitor.on('room-event',({event,data})=>{
    if(event==='host-away') away=true;
    if(event==='host-changed' && data.newHostId===visitor.id) handed=true;
  });

  host.disconnect();
  await wait(2000);

  const room=getRoomsMap().get(roomId);
  check('room is NOT handed to the visitor on a drop', handed===false);
  check('everyone is told the host stepped away', away===true);
  check('nobody holds host while they are away', room && room.hostId===null, 'hostId='+(room&&room.hostId));
  check('the room remembers who to wait for', room && String(room.hostAwayUserId)===HOST_ID);

  const back=conn(); await new Promise(r=>back.on('connect',r));
  const bAck=await joined(back,{roomId,authToken:HOST_TOKEN});
  check('returning host gets the room back', bAck.success===true && bAck.isHost===true);
  check('visitor never became host at any point', handed===false);
  visitor.disconnect(); back.disconnect();

  // ---- Scenario 2: leaving on purpose -------------------------------------
  const r2='check-leave-'+Date.now();
  const h2=conn(); await new Promise(r=>h2.on('connect',r));
  await joined(h2,{roomId:r2,authToken:HOST_TOKEN,isHost:true,roomName:'Check2'});
  const v2=conn(); await new Promise(r=>v2.on('connect',r));
  await joined(v2,{roomId:r2,authToken:VISITOR_TOKEN});

  const promoted=new Promise(res=>v2.on('room-event',({event,data})=>{ if(event==='host-changed') res(data.newHostId); }));
  h2.emit('leave-room',{roomId:r2});
  const newHost=await Promise.race([promoted, wait(4000).then(()=>null)]);
  check('a deliberate leave hands the room on at once', newHost===v2.id, 'newHost='+newHost);
  h2.disconnect(); v2.disconnect();

  await wait(300);
  await User.deleteMany({email:{$in:['hh-host@test.local','hh-visitor@test.local']}});
  await mongoose.disconnect();
  io.close(); srv.close();
  const failed=results.filter(r=>!r.pass).length;
  console.log('\n'+(results.length-failed)+'/'+results.length+' checks passed');
  process.exit(failed?1:0);
})().catch(e=>{ console.error('ERROR', e.message); process.exit(2); });
