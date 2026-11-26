import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';

export const MAX_EVENT_IDS = 500;

export class ListEventsByIdsDTO {
  // gRPC omits empty repeated fields, so the list may arrive undefined
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_IDS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids?: number[];
}
