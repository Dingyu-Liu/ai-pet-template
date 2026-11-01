const fs=require('fs');
const c=JSON.parse(fs.readFileSync('C:/Users/<你的用户名>/.bili-ai/credentials.json','utf8'));
const cookie=`SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}; buvid3=${c.buvid3}`;
(async()=>{
 const u='https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs?talker_id=<你的B站UID>&session_type=1&size=5&build=0&mobi_app=web';
 const r=await fetch(u,{headers:{cookie,'user-agent':'Mozilla/5.0','referer':'https://message.bilibili.com/'}});
 const j=await r.json();
 const msgs=(j.data&&j.data.messages)||[];
 for(const m of msgs.slice(0,5)) console.log(String(m.timestamp), m.msg_type, JSON.stringify(m.content).slice(0,300));
})().catch(e=>console.error('ERR',e.message));
