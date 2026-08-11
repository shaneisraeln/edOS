/**
 * Google OAuth Strategy
 *
 * To enable:
 * 1. Install passport-google-oauth20: pnpm add passport-google-oauth20 @types/passport-google-oauth20
 * 2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 * 3. Uncomment the strategy registration in auth.module.ts
 *
 * For now this is a scaffold showing the integration pattern.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy /* extends PassportStrategy(Strategy, 'google') */ {
  constructor(private configService: ConfigService) {
    // super({
    //   clientID: configService.get('GOOGLE_CLIENT_ID'),
    //   clientSecret: configService.get('GOOGLE_CLIENT_SECRET'),
    //   callbackURL: `${configService.get('APP_URL', 'http://localhost:3001')}/api/auth/google/callback`,
    //   scope: ['email', 'profile'],
    // });
  }

  // async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
  //   const { name, emails } = profile;
  //   const user = {
  //     email: emails[0].value,
  //     name: `${name.givenName} ${name.familyName}`,
  //     provider: 'google',
  //   };
  //   done(null, user);
  // }
}
