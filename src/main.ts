import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Serve uploaded images statically
  const path = require("path");
  const express = require("express");
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  const configService = app.get(ConfigService);

  // ── CORS ──────────────────────────────────────────────────────────────────
  const frontendOrigin = configService.get<string>(
    'FRONTEND_ORIGIN',
    'http://localhost:5173',
  );
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (curl, server-to-server) or any localhost/127.0.0.1 port
      if (
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        origin === frontendOrigin
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Accept', 'x-session-id', 'Authorization'],
    credentials: true,
  });

  // ── Global Validation Pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EmbiTrail API')
    .setDescription(
      'REST API for the EmbiTrail one-day travel planner around Embilipitiya, Sri Lanka.\n\n' +
      '**Session-based plan endpoints** require the `x-session-id` header.\n\n' +
      '**Places & Categories Mutations**: Require Bearer token authentication.\n\n' +
      '**Admin Auth**: Multi-factor authentication with email OTP verification.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your Admin JWT access_token',
        in: 'header',
      },
      'bearer',
    )
    .addTag('Admin Auth', 'Administrator authentication & password recovery')
    .addTag('Places', 'CRUD for tourist places')
    .addTag('Categories', 'CRUD for place categories')
    .addTag('Visit Plan', 'Session-based visit plan management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
  });

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`\n🚀 EmbiTrail API running on http://localhost:${port}`);
  console.log(`📖 Swagger docs at  http://localhost:${port}/api/docs\n`);
}

void bootstrap();
