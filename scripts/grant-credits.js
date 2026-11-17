// Owner-only CLI; never expose on public routes. STUDIO_DATA_DIR must match deployed server.
import {grant} from '../account-db.js';
const [email,value] = process.argv.slice(2);
const amount=Number(value);
if(!email||!Number.isSafeInteger(amount)||amount<=0){
 console.error('Usage: STUDIO_DATA_DIR=/persistent/data node scripts/grant-credits.js user@example.com 100');
 process.exit(1);
}
try{
 const result=grant(email,amount);
 console.log(`Granted ${amount} credits to ${result.email}. Balance: ${result.credits}`);
}catch(e){console.error('Could not grant credits:',e.message);process.exitCode=1}
