import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionEntity } from '../../entities/permission.entity';
import { DeviceEntity } from '../../entities/device.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
  ) {}

  async getPermissions(userId: string) {
    let perms = await this.permRepo.findOne({ where: { userId } });
    if (!perms) {
      perms = await this.permRepo.save(this.permRepo.create({ userId }));
    }
    return perms;
  }

  async updatePermissions(userId: string, updates: Partial<PermissionEntity>) {
    let perms = await this.permRepo.findOne({ where: { userId } });
    if (!perms) {
      perms = this.permRepo.create({ userId, ...updates });
    } else {
      Object.assign(perms, updates);
    }
    return this.permRepo.save(perms);
  }

  async getDevices(userId: string) {
    return this.deviceRepo.find({ where: { userId }, order: { lastActiveAt: 'DESC' } });
  }

  async registerDevice(userId: string, data: { deviceName: string; platform: string; deviceId?: string }) {
    const existing = data.deviceId
      ? await this.deviceRepo.findOne({ where: { userId, deviceId: data.deviceId } })
      : null;

    if (existing) {
      existing.lastActiveAt = new Date();
      existing.active = true;
      return this.deviceRepo.save(existing);
    }

    return this.deviceRepo.save(
      this.deviceRepo.create({ userId, ...data, lastActiveAt: new Date() }),
    );
  }

  async removeDevice(userId: string, deviceId: string) {
    await this.deviceRepo.update({ id: deviceId, userId }, { active: false });
    return { ok: true };
  }
}
