import { Injectable, Logger } from '@nestjs/common';
import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';

import { ReadingService } from './reading.service';
import { WorkspaceService } from './workspace.service';
import { XunjiService } from './xunji.service';

@Injectable()
@Automation()
export class WorkspaceAutomation {
  private readonly logger = new Logger(WorkspaceAutomation.name);

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly reading: ReadingService,
    private readonly xunji: XunjiService,
  ) {}

  @BindTrigger('dailyWereadSync')
  async syncWeRead(): Promise<void> {
    for (const ownerId of await this.workspace.ownerIds()) {
      try {
        await this.reading.sync(ownerId);
        this.logger.log('微信读书自动同步完成');
      } catch (error) {
        this.logger.error('微信读书自动同步失败', error instanceof Error ? error.stack : String(error));
      }
    }
  }

  @BindTrigger('dailyXunjiSync')
  async syncXunji(): Promise<void> {
    const endDate = localDate();
    const startDate = shiftDate(endDate, -7);
    for (const ownerId of await this.workspace.ownerIds()) {
      try {
        await this.xunji.sync(ownerId, { startDate, endDate });
        this.logger.log('训记自动同步完成');
      } catch (error) {
        this.logger.error('训记自动同步失败', error instanceof Error ? error.stack : String(error));
      }
    }
  }
}

function localDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
