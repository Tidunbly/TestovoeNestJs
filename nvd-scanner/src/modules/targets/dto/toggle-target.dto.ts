import { IsBoolean, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleTargetDto {
  @ApiProperty({
    description: 'IP address or domain name to enable/disable',
    example: '192.168.1.1',
  })
  @IsString()
  resource: string;

  @ApiProperty({
    description: 'New enabled state for the target',
    example: false,
  })
  @IsBoolean()
  enabled: boolean;
}
