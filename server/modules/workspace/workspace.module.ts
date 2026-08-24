import { Module } from '@nestjs/common';

import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { ReadingService } from './reading.service';
import { XunjiService } from './xunji.service';
import { WorkspaceAutomation } from './workspace.automation';

@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, ReadingService, XunjiService, WorkspaceAutomation],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
