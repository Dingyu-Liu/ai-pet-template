const WebSocket = require(process.argv[2]);
const ws = new WebSocket('ws://127.0.0.1:3002');
let n=0;
ws.on('open',()=>{console.log('OPEN');ws.send(JSON.stringify({action:'get_login_info',params:{},echo:'x1'}));});
ws.on('message',d=>{const s=d.toString();console.log('MSG',s.slice(0,200));n++;if(n>=5){ws.close();process.exit(0);}});
ws.on('error',e=>{console.log('ERR',e.message);process.exit(1);});
setTimeout(()=>{console.log('TIMEOUT n='+n);process.exit(2);},8000);
