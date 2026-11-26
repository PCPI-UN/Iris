import { OwnProfileFieldsDto } from '@app/common/dtos/own-profile.dto';

/**
 * Body of PATCH /profile/me. Same fields and rules as the auth-service request,
 * which adds the userId taken from the session.
 */
export class UpdateOwnProfileDto extends OwnProfileFieldsDto {}
