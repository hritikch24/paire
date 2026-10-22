/** Date Duet only carries enumerated choices; no identities, venues or schedule. */
export const ACTIVITIES = [
  {id:'chai',label:'Chai & a conversation',icon:'◌',detail:'A public café, a proper conversation',paid:true},
  {id:'walk',label:'A daylight park walk',icon:'↗',detail:'A well-used public park, in daylight',paid:false},
  {id:'books',label:'A bookshop browse',icon:'▤',detail:'Swap recommendations in a public bookshop',paid:false},
  {id:'art',label:'Art & little observations',icon:'✳',detail:'A public gallery; check entry prices together',paid:true},
  {id:'dessert',label:'Dessert & a detour',icon:'✦',detail:'A public dessert spot, no elaborate agenda',paid:true},
  {id:'games',label:'A friendly game',icon:'◇',detail:'A public board-game café',paid:true}
];
export const WINDOWS = [{id:'daylight',label:'Daylight'},{id:'evening',label:'Early evening'}];
export const NOISE = [{id:'quiet',label:'Somewhere quiet'},{id:'lively',label:'A little buzz'},{id:'either',label:'Either feels good'}];
const keys=['activities','windows','budget','minutes','noise'];
export function validChoices(p){return Boolean(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k))&&list(p.activities,ACTIVITIES.map(x=>x.id),3)&&list(p.windows,WINDOWS.map(x=>x.id),2)&&[0,300,800].includes(p.budget)&&[30,60,90].includes(p.minutes)&&NOISE.some(x=>x.id===p.noise));}
function list(value,allowed,max){return Array.isArray(value)&&value.length>0&&value.length<=max&&new Set(value).size===value.length&&value.every(x=>allowed.includes(x));}
export function compareChoices(a,b){
  if(!validChoices(a)||!validChoices(b))throw Error('Choose an answer for each step.');
  const budget=Math.min(a.budget,b.budget),minutes=Math.min(a.minutes,b.minutes);
  const sharedActivities=ACTIVITIES.filter(x=>a.activities.includes(x.id)&&b.activities.includes(x.id));
  const activities=sharedActivities.filter(x=>budget!==0||!x.paid);
  // A park walk requires a daylight overlap, even if both also chose evenings.
  const windows=WINDOWS.filter(x=>a.windows.includes(x.id)&&b.windows.includes(x.id));
  const usable=activities.filter(x=>x.id!=='walk'||windows.some(w=>w.id==='daylight'));
  const noise=a.noise==='either'?b.noise:b.noise==='either'?a.noise:a.noise===b.noise?a.noise:null;
  const differences=[];
  if(!sharedActivities.length)differences.push('You picked different activities. Choose one you would both enjoy.');
  else if(!activities.length)differences.push('Your shared activities may cost money. Choose a free plan together to respect the lower budget.');
  else if(!usable.length)differences.push('A park walk needs a shared daylight window. Pick daylight together or another public activity.');
  if(!windows.length)differences.push('Your preferred time windows differ. Find a window that suits you both.');
  if(noise===null)differences.push('One of you prefers quiet, the other a livelier place. Talk about a setting that feels good for both.');
  return {ready:!differences.length,activities:usable,windows,noise,budget,minutes,differences};
}
export function pack(a,b){if(!validChoices(a)||(b!==undefined&&!validChoices(b)))throw Error('Invalid choices');const json=JSON.stringify({v:1,a,...(b?{b}:{})});return btoa(json).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unpack(raw){
  try{if(typeof raw!=='string'||raw.length>900||! /^[A-Za-z0-9_-]+$/.test(raw))return null;const p=JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/')));if(!p||p.v!==1||Object.keys(p).some(k=>!['v','a','b'].includes(k))||!validChoices(p.a)||(Object.hasOwn(p,'b')&&!validChoices(p.b)))return null;return p;}catch{return null;}
}
