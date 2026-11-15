// Identity feature public surface.
export { identityService } from './services/identity.service.ts';
export {
  getMsLeftFromNow,
  initialState,
  isValidCode,
  parseCode,
  parseIdentifyResponse,
  startRequestBody,
  submitCodeRequestBody,
  transition,
} from './identity-verification.ts';
export type {
  IdentifyEvent,
  IdentifyFailure,
  IdentifyResult,
  IdentifyState,
} from './identity-verification.ts';

// Side-effect import: registering the custom element when the feature
// is imported.
import './components/identify-user-page.ts';
