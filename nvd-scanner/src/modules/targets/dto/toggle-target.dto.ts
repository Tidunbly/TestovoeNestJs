import { IsBoolean, IsString } from 'class-validator';

export class ToggleTargetDto {
  @IsString()
  resource: string;

  @IsBoolean()
  enabled: boolean;
}
