const fs=require('fs');
const c=JSON.parse(fs.readFileSync('C:/Users/<你的用户名>/.bili-ai/credentials.json','utf8'));
const cookie=`SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}; buvid3=${c.buvid3}`;
(async()=>{
 const r=await fetch('https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions?session_type=1&group_id=0&build=0&mobi_app=web',{headers:{cookie,'user-agent':'Mozilla/5.0','referer':'https://message.bilibili.com/'}});
 const j=await r.json();
 const list=(j.data&&j.data.session_list)||[];
 for(const s of list.slice(0,6)){
   const ts=s.session_ts||s.timestamp||0;
   console.log('talker',s.talker_id,'ts',ts,'content',JSON.stringify((s.last_msg&&s.last_msg.content)||'').slice(0,200));
 }
})().catch(e=>console.error('ERR',e.message));
