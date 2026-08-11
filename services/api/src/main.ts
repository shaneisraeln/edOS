import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  // Security headers
  app.use(helmet.default({
    contentSecurityPolicy: isProduction ? undefined : false, // Disable CSP in dev for Swagger
  }));

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: isProduction
      ? (process.env.FRONTEND_URL || 'https://edos.app')
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Input validation + sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip unknown properties
      forbidNonWhitelisted: true,   // Throw on unknown properties
      transform: true,              // Auto-transform payloads to DTO types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Request size limit (prevent abuse — max 1MB body)
  const expressApp = app.getHttpAdapter().getInstance();
  const bodyParser = require('body-parser');
  expressApp.use(bodyParser.json({ limit: '1mb' }));
  expressApp.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  // Swagger API Documentation (disable in production if desired)
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('edOS API')
      .setDescription('AI-native Learning Operating System API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`edOS API running on http://localhost:${port} [${process.env.NODE_ENV || 'development'}]`);
  if (!isProduction) {
    console.log(`API Docs available at http://localhost:${port}/docs`);
  }
}

bootstrap();
