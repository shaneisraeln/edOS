/**
 * GitHub OAuth Strategy
 *
 * To enable:
 * 1. Install passport-github2: pnpm add passport-github2 @types/passport-github2
 * 2. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env
 * 3. Uncomment the strategy registration in auth.module.ts
 *
 * For now this is a scaffold showing the integration pattern.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import { PassportStrategy } from '@nestjs/passport';
// import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy /* extends PassportStrategy(Strategy, 'github') */ {
  constructor(private configService: ConfigService) {
    // super({
    //   clientID: configService.get('GITHUB_CLIENT_ID'),
    //   clientSecret: configService.get('GITHUB_CLIENT_SECRET'),
    //   callbackURL: `${configService.get('APP_URL', 'http://localhost:3001')}/api/auth/github/callback`,
    //   scope: ['user:email'],
    // });
  }

  // async validate(accessToken: string, refreshToken: string, profile: any) {
  //   return {
  //     email: profile.emails?.[0]?.value,
  //     name: profile.displayName || profile.username,
  //     provider: 'github',
  //   };
  // }
}
