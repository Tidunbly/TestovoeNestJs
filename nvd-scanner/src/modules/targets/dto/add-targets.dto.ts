import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTargetsDto {
  @ApiProperty({
    description: 'IP addresses or domain names to add as scan targets',
    example: ['192.168.1.1', 'example.com'],
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  resources: string[];
}
