import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
const source=process.env.DATABASE_PATH||'data/watchout.sqlite',target=process.argv[2];
if(!target||!existsSync(source))throw Error('Usage: DATABASE_PATH=data/watchout.sqlite node scripts/backup.mjs /existing/backup/directory/new-file.sqlite');
if(existsSync(target))throw Error('Refusing to overwrite a backup.');
const db=new DatabaseSync(source);db.prepare('VACUUM INTO ?').run(resolve(target));db.close();
const backup=new DatabaseSync(target,{readOnly:true});const check=backup.prepare('PRAGMA integrity_check').get();backup.close();if(Object.values(check)[0]!=='ok')throw Error('Backup integrity check failed');console.log('Consistent SQLite backup created; integrity_check=ok. Store it encrypted with restricted access.');
