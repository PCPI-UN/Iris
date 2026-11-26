import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();

// Roles and permissions are created by the migrations of auth-service (catalogue with
// fixed role ids), so they reach databases that are already seeded, such as production.
// The seed only provisions the initial users.

// Default passwords for development
const DEFAULT_PASSWORDS = {
  admin: 'Admin1234@',
  testUser: 'User1234@',
};

/**
 * Prompt for password input from terminal
 */
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const stdin = process.stdin;
    const onData = (char: string) => {
      char = char.toString();
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          break;
        default:
          process.stdout.write('\b \b');
          break;
      }
    };

    rl.question(prompt, (password) => {
      rl.close();
      resolve(password);
    });

    stdin.on('data', onData);
  });
}

/**
 * Generate a secure random password
 */
function generateSecurePassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + symbols;

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/**
 * Check if running in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validate password strength
 */
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get admin password with smart fallback logic
 */
async function getAdminPassword(): Promise<string> {
  // Priority 1: Check environment variable
  const envPassword = process.env.SEED_ADMIN_PASSWORD;
  if (envPassword) {
    console.log('  ✓ Using admin password from SEED_ADMIN_PASSWORD environment variable');
    return envPassword;
  }

  // Priority 2: Production must have explicit password
  if (isProduction()) {
    // Check if interactive
    if (process.stdin.isTTY) {
      console.log('\n⚠️  PRODUCTION MODE: Password required!\n');
      const password = await promptPassword('Enter admin password: ');
      console.log('\n');

      const validation = validatePassword(password);
      if (!validation.valid) {
        console.error('❌ Password validation failed:');
        validation.errors.forEach(err => console.error(`   - ${err}`));
        process.exit(1);
      }

      return password;
    } else {
      // Non-interactive production: Generate secure password
      const randomPassword = generateSecurePassword();
      console.log('\n⚠️  PRODUCTION MODE: No ADMIN_PASSWORD set. Generated secure password.');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`   ${randomPassword}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log('⚠️  SAVE THIS PASSWORD! It will not be shown again.\n');
      return randomPassword;
    }
  }

  // Priority 3: Development with interactive terminal
  if (process.stdin.isTTY) {
    console.log('\n🔐 Admin Password Setup (Development Mode)');
    console.log('════════════════════════════════════════════════════════════');
    console.log('Press ENTER to use default password, or type a custom one:');
    console.log(`Default: ${DEFAULT_PASSWORDS.admin}`);
    console.log('════════════════════════════════════════════════════════════\n');

    const password = await promptPassword('Enter admin password [press ENTER for default]: ');
    console.log('\n');

    // Use default if empty
    if (!password || password.trim() === '') {
      console.log(`✓ Using default development password: ${DEFAULT_PASSWORDS.admin}\n`);
      return DEFAULT_PASSWORDS.admin;
    }

    // Validate custom password
    const validation = validatePassword(password);
    if (!validation.valid) {
      console.error('❌ Password validation failed:');
      validation.errors.forEach(err => console.error(`   - ${err}`));
      process.exit(1);
    }

    console.log('✅ Using custom password\n');
    return password;
  }

  // Priority 4: Development non-interactive (CI/CD, Docker build)
  console.log(`\n💡 Development Mode: Using default admin password: ${DEFAULT_PASSWORDS.admin}`);
  console.log('   Set ADMIN_PASSWORD environment variable to use a different password.\n');
  return DEFAULT_PASSWORDS.admin;
}

/**
 * Get test user password
 */
function getTestUserPassword(): string {
  // Check environment variable first
  const envPassword = process.env.SEED_TEST_USER_PASSWORD;
  if (envPassword) {
    return envPassword;
  }

  // Production: warn about default
  if (isProduction()) {
    console.warn('⚠️  Production: Using default test user password! Set SEED_TEST_USER_PASSWORD env var.');
  }

  // Use default for development
  return DEFAULT_PASSWORDS.testUser;
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  // 1. Roles and permissions come from the migrations
  const roleCount = await prisma.role.count();
  const permissionCount = await prisma.permission.count();
  if (roleCount === 0) {
    console.error('❌ No roles found: run the migrations of auth-service before the seed.');
    process.exit(1);
  }

  // 2. Admin User Provisioning (Idempotente)
  const adminRole = await prisma.role.findFirst({
    where: { name: 'Admin' },
  });

  if (!adminRole) {
    console.error('❌ Admin role not found. Cannot provision admin user.');
    process.exit(1);
  }

  const targetAdminEmail = isProduction()
    ? process.env.SEED_ADMIN_EMAIL
    : 'admin@iris.local';

  const targetAdminPassword = isProduction()
    ? process.env.SEED_ADMIN_PASSWORD
    : await getAdminPassword();

  if (targetAdminEmail && targetAdminPassword) {
    const existingUser = await prisma.user.findUnique({
      where: { email: targetAdminEmail },
    });

    if (!existingUser) {
      if (isProduction()) {
        console.log('👤 Provisioning nominal admin user from environment variables...');
        const validation = validatePassword(targetAdminPassword);
        if (!validation.valid) {
          console.error('❌ SEED_ADMIN_PASSWORD does not meet security requirements:');
          validation.errors.forEach((err) => console.error(`   - ${err}`));
          process.exit(1);
        }
      } else {
        console.log(`👤 Provisioning admin user: ${targetAdminEmail}...`);
      }

      const hashedAdminPassword = await bcrypt.hash(targetAdminPassword, 10);
      const adminUser = await prisma.user.create({
        data: {
          firstName: 'Admin',
          lastName: 'System',
          email: targetAdminEmail,
          password: hashedAdminPassword,
          active: true,
          status: 'CONFIRMED',
        },
      });

      await prisma.platformStaff.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          active: true,
        },
      });

      if (isProduction()) {
        console.log('✅ Admin user provisioned successfully in production.\n');
      } else {
        console.log(`✅ Admin user created with Admin role: ${targetAdminEmail}\n`);
      }
    } else {
      if (isProduction()) {
        console.log('ℹ️ Admin user already exists. Ensuring Admin role...\n');
      } else {
        console.log(`ℹ️ Admin user ${targetAdminEmail} already exists. Ensuring Admin role...\n`);
      }
      await prisma.platformStaff.upsert({
        where: {
          userId_roleId: {
            userId: existingUser.id,
            roleId: adminRole.id,
          },
        },
        update: { active: true },
        create: {
          userId: existingUser.id,
          roleId: adminRole.id,
          active: true,
        },
      });
      if (isProduction()) {
        console.log('✅ Admin role confirmed in production.\n');
      } else {
        console.log(`✅ Admin role confirmed for ${targetAdminEmail}\n`);
      }
    }
  } else {
    console.log('🔒 Skipping admin creation: No admin credentials provided.\n');
  }

  // 3. Test User Provisioning (Solo en Desarrollo)
  if (!isProduction()) {
    const existingTestUser = await prisma.user.findUnique({
      where: { email: 'aki@iris.local' },
    });

    if (!existingTestUser) {
      console.log('👤 Creating test regular user (Development only)...');
      const testUserPassword = getTestUserPassword();
      const hashedTestPassword = await bcrypt.hash(testUserPassword, 10);

      const testUser = await prisma.user.create({
        data: {
          firstName: 'Aki',
          lastName: 'Hayakawa',
          email: 'aki@iris.local',
          password: hashedTestPassword,
          active: true,
          status: 'CONFIRMED',
        },
      });

      const userRole = await prisma.role.findFirst({
        where: { name: 'User' },
      });

      if (userRole) {
        await prisma.platformStaff.create({
          data: {
            userId: testUser.id,
            roleId: userRole.id,
            active: true,
          },
        });
        console.log(`  ✓ Created test user: ${testUser.email} with USER role\n`);
      }
    }
  }

  // 4. Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎉 Database seeding completed successfully!');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📋 Summary:');
  console.log(`   • Environment: ${isProduction() ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`   • Permissions: ${permissionCount} (created by the migrations)`);
  console.log(`   • Roles: ${roleCount} (created by the migrations)`);

  if (!isProduction()) {
    console.log('   • Admin User: admin@iris.local');
    console.log('   • Test User: aki@iris.local\n');
    console.log('🔐 Default Credentials (Development only):');
    console.log(`   • Admin: ${DEFAULT_PASSWORDS.admin}`);
    console.log(`   • Test User: ${DEFAULT_PASSWORDS.testUser}\n`);
  } else {
    console.log('   • Admin User: Provisioned via environment variables.');
    console.log('   • Test Users: Disabled.\n');
  }

  if (!isProduction() && !process.env.ADMIN_PASSWORD) {
    console.log('📝 Development Note:');
    console.log('   Default passwords are convenient for development.');
    console.log('   For production, ALWAYS set ADMIN_PASSWORD environment variable!\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });