import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { GrpcExceptionFilter } from './common/filters/grpc-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpCacheInterceptor } from './common/cache/http-cache.interceptor';
import { CacheInvalidationInterceptor } from './common/cache/cache-invalidation.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  }); 
  app.use(cookieParser());

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GrpcExceptionFilter());

  // NOTE: Temporaly commented because it's not completely ready yet!
  // Register cache interceptors globally
  // app.useGlobalInterceptors(
  //   app.get(HttpCacheInterceptor),
  //   app.get(CacheInvalidationInterceptor),
  // );

  const config = new DocumentBuilder()
    .setTitle('Iris API')
    .setDescription('The Iris platform API documentation - Event and Project Management System')
    .setVersion('1.0')
    .addTag('auth', 'Authentication and authorization endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('events', 'Event management endpoints')

    .addBearerAuth(
      {
        type: 'apiKey',
        name: 'access_token',
        in: 'cookie',
        description: 'JWT access token stored in HTTP-only cookie. Set automatically after login.',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Iris API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  await app.listen(3000);
}
bootstrap();
