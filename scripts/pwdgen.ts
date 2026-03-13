const password = process.argv[2];

if (!password) {
  console.error('Please provide a password as an argument.');
  process.exit(1);
}

import { hashPassword } from '../src/lib/auth';

hashPassword(password).then((hashed) => {
  console.log(`Hashed password: ${hashed}`);
});
