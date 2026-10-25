/**
 * Admin provisioning CLI script.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@embitrail.lk ADMIN_PASSWORD=AdminStrongPassword2026! npm run seed:admin
 *
 * Or:
 *   npm run seed:admin -- --email admin@embitrail.lk --password AdminStrongPassword2026!
 *
 * Uses Argon2id for secure password hashing.
 * Never stores or prints plaintext passwords.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { Admin } from '../src/admin/admin.entity';
import { AuthChallenge } from '../src/admin/auth-challenge.entity';
import { AuthResetToken } from '../src/admin/auth-reset-token.entity';
import { Category } from '../src/categories/category.entity';
import { Place } from '../src/places/place.entity';
import { User } from '../src/users/user.entity';
import { Favourite } from '../src/favourites/favourite.entity';
import { VisitPlan } from '../src/plan/visit-plan.entity';
import { PlanItem } from '../src/plan/plan-item.entity';

function parseArgs(): { email?: string; password?: string } {
  const args = process.argv.slice(2);
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--email' || args[i] === '-e') && args[i + 1]) {
      email = args[i + 1];
      i++;
    } else if ((args[i] === '--password' || args[i] === '-p') && args[i + 1]) {
      password = args[i + 1];
      i++;
    }
  }

  return { email, password };
}

async function seedAdmin() {
  const { email, password } = parseArgs();

  if (!email || !password) {
    console.error('\n❌ Missing required admin credentials.');
    console.error('Usage:');
    console.error('  ADMIN_EMAIL=admin@embitrail.lk ADMIN_PASSWORD=AdminStrongPassword2026! npm run seed:admin\n');
    console.error('Or:');
    console.error('  npm run seed:admin -- --email admin@embitrail.lk --password AdminStrongPassword2026!\n');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    console.error('❌ Invalid email address format.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters long.');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [
      Category,
      Place,
      User,
      Favourite,
      VisitPlan,
      PlanItem,
      Admin,
      AuthChallenge,
      AuthResetToken,
    ],
    synchronize: true,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    logging: ['error'],
  });

  await dataSource.initialize();
  console.log('✅ Database connected');

  const adminRepo = dataSource.getRepository(Admin);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // There is only one administrator
  const existingAdmin = await adminRepo.createQueryBuilder('admin').getOne();

  if (existingAdmin) {
    existingAdmin.email = normalizedEmail;
    existingAdmin.username = normalizedEmail;
    existingAdmin.password_hash = passwordHash;
    existingAdmin.token_version = (existingAdmin.token_version || 1) + 1;
    await adminRepo.save(existingAdmin);
    console.log(`✅ Administrator account updated for email: ${normalizedEmail}`);
  } else {
    const newAdmin = adminRepo.create({
      email: normalizedEmail,
      username: normalizedEmail,
      password_hash: passwordHash,
      token_version: 1,
    });
    await adminRepo.save(newAdmin);
    console.log(`✅ Administrator account created for email: ${normalizedEmail}`);
  }

  await dataSource.destroy();
  console.log('🌱 Admin provisioning complete!\n');
}

seedAdmin().catch((err) => {
  console.error('Admin provisioning failed:', err);
  process.exit(1);
});
