import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, str } from '@lit/localize';
import { localized } from '@/features/localization';
import { notificationService } from '@/features/notifications';
import { authService } from '@/features/auth';
import '@/shared/components/confirm-dialog';
import '@/shared/components/modal-dialog';
import '@/shared/components/form-field';
import '@/shared/components/ui-button';
import '@/shared/components/ui-card';
import '@/shared/components/ui-copy-field';
import '@/shared/components/ui-qr';
import '@/shared/components/ui-empty-state';
import '@/shared/components/ui-skeleton';
import { kanidmStatusService } from '@/shared/services/kanidm-status.service';
import {
  applicationService,
  type ApplicationSummary,
} from '@/features/applications';
import { personService } from '../services/person.service';
import { buildResetUrl, qrDataUrl, qrPngBlob } from '../utils/reset-link';
import type {
  CreatedApplicationPassword,
  CredentialDetailType,
  CredentialUpdateStatusView,
  PersonApplicationPassword,
} from '../types/person.types';
import { personCredentialsTabStyles } from './person-credentials-tab.styles';

/** Default intent TTL in seconds (matches the kanidm CLI default). */
const DEFAULT_INTENT_TTL = 3600;

/** Human-readable label for a CredentialDetailType variant. */
function credentialTypeLabel(type: CredentialDetailType): string {
  if (typeof type === 'string') {
    switch (type) {
      case 'Password':
        return msg('Password');
      case 'GeneratedPassword':
        return msg('Generated Password');
      default:
        return type;
    }
  }
  if ('Passkey' in type) {
    return msg('Passkey');
  }
  return msg('Password (MFA)');
}

@customElement('person-credentials-tab')
@localized()
export class PersonCredentialsTab extends LitElement {
  /** Person id (name or uuid). */
  @property() id = '';

  @state() private loading = false;
  @state() private creds: Array<{
    uuid: string;
    type_: CredentialDetailType;
  }> = [];
  @state() private appPasswords: PersonApplicationPassword[] = [];
  @state() private applications: ApplicationSummary[] = [];
  @state() private appPasswordModalOpen = false;
  @state() private appPasswordLabel = '';
  @state() private appPasswordApplication = '';
  @state() private appPasswordLabelError = '';
  @state() private appPasswordApplicationError = '';
  @state() private appPasswordBusy = false;
  @state() private createdAppPassword: CreatedApplicationPassword | null = null;
  @state() private intentToken: string | null = null;
  @state() private kanidmUrl: string | null = null;
  @state() private qrOpen = false;
  @state() private emailModalOpen = false;
  @state() private emailValue = '';
  @state() private submitting = false;
  /** TOTP labels of the credential pending a "disable MFA" confirm. */
  @state() private mfaConfirm: string[] | null = null;
  @state() private mfaBusy = false;
  @state() private softlockBusy = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.id) {
      return;
    }
    this.loading = true;
    try {
      const [status, appPasswords, applications] = await Promise.all([
        personService.credentialStatus(this.id),
        personService.applicationPasswords(this.id).catch(() => []),
        applicationService.list().catch(() => []),
      ]);
      this.creds = status.creds ?? [];
      this.appPasswords = appPasswords;
      this.applications = applications;
    } catch {
      notificationService.error(msg('Failed to load credential status.'));
    } finally {
      this.loading = false;
    }
  }

  private async handleCreateIntent(): Promise<void> {
    this.submitting = true;
    try {
      const token = await authService.withStepUp(() =>
        personService.credentialUpdateIntent(this.id, DEFAULT_INTENT_TTL)
      );
      this.intentToken = token;
      this.qrOpen = false;
      // The effective Kanidm base URL is only known backend-side; a
      // failed lookup just hides the link/QR options (token still shown).
      void this.loadKanidmUrl();
      notificationService.success(msg('Credential reset link created.'));
    } catch {
      notificationService.error(msg('Failed to create credential reset link.'));
    } finally {
      this.submitting = false;
    }
  }

  private async loadKanidmUrl(): Promise<void> {
    const status = await kanidmStatusService.fetchStatus();
    this.kanidmUrl = status.kanidmUrl;
  }

  /** Full reset link, or null while the base URL is unknown. */
  private get resetUrl(): string | null {
    if (!this.intentToken || !this.kanidmUrl) {
      return null;
    }
    return buildResetUrl(this.kanidmUrl, this.intentToken);
  }

  private toggleQr(): void {
    this.qrOpen = !this.qrOpen;
  }

  private async handleCopyQrImage(): Promise<void> {
    const url = this.resetUrl;
    if (!url) {
      return;
    }
    try {
      const blob = await qrPngBlob(url);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      notificationService.success(msg('Reset link copied to clipboard.'));
    } catch {
      notificationService.error(msg('Failed to copy to clipboard.'));
    }
  }

  private openEmailModal(): void {
    this.emailValue = '';
    this.emailModalOpen = true;
  }

  private closeEmailModal(): void {
    this.emailModalOpen = false;
  }

  private async handleSendEmail(event: Event): Promise<void> {
    event.preventDefault();
    const email = this.emailValue.trim();
    if (!email) {
      return;
    }
    this.submitting = true;
    try {
      await authService.withStepUp(() =>
        personService.sendCredentialIntent(this.id, DEFAULT_INTENT_TTL, email)
      );
      notificationService.success(msg(str`Reset link sent to ${email}.`));
      this.closeEmailModal();
    } catch {
      notificationService.error(msg('Failed to send reset link.'));
    } finally {
      this.submitting = false;
    }
  }

  /** Clear the account's credential softlock (step-up required). */
  private async handleClearSoftlock(): Promise<void> {
    if (this.softlockBusy) {
      return;
    }
    this.softlockBusy = true;
    try {
      await authService.withStepUp(() => personService.resetSoftlock(this.id));
      notificationService.success(msg('Softlock cleared.'));
    } catch {
      notificationService.error(msg('Failed to clear softlock.'));
    } finally {
      this.softlockBusy = false;
    }
  }

  /** TOTP labels enrolled on a credential of type PasswordMfa. */
  private totpLabelsOf(type: CredentialDetailType): string[] {
    if (typeof type === 'object' && 'PasswordMfa' in type) {
      return type.PasswordMfa[0] ?? [];
    }
    return [];
  }

  private openMfaConfirm(cred: {
    uuid: string;
    type_: CredentialDetailType;
  }): void {
    const labels = this.totpLabelsOf(cred.type_);
    if (labels.length === 0) {
      return;
    }
    this.mfaConfirm = labels;
  }

  private closeMfaConfirm(): void {
    if (!this.mfaBusy) {
      this.mfaConfirm = null;
    }
  }

  /** Human text for CUStatus warnings that blocked the commit. */
  private mfaWarningText(warnings: string[]): string {
    if (warnings.includes('MfaRequired')) {
      return msg(
        'Account policy requires MFA, so two-factor authentication cannot be disabled.'
      );
    }
    if (warnings.length > 0) {
      return msg('Kanidm refused the change.') + ` [${warnings.join(', ')}]`;
    }
    return msg('Failed to disable MFA.');
  }

  /**
   * Disable MFA: one detail credential-update session per confirm
   * (vendor credential update REPL): begin -> TotpRemove per label ->
   * commit. Warnings that block the commit (e.g. policy MfaRequired)
   * abort before commit, so nothing is persisted.
   */
  private async handleDisableMfa(): Promise<void> {
    const labels = this.mfaConfirm;
    if (!labels || this.mfaBusy) {
      return;
    }
    this.mfaBusy = true;
    try {
      await authService.withStepUp(async () => {
        const { token } = await personService.credentialUpdateBegin(this.id);
        let status: CredentialUpdateStatusView | undefined;
        for (const label of this.mfaConfirm ?? []) {
          status = await personService.credentialUpdateAction(token, {
            totpremove: label,
          });
        }
        if (!status || !status.can_commit) {
          throw new Error(this.mfaWarningText(status?.warnings ?? []));
        }
        await personService.credentialUpdateCommit(token);
      });
      notificationService.success(msg('Two-factor authentication disabled.'));
    } catch (error) {
      notificationService.error(
        error instanceof Error && error.message
          ? error.message
          : msg('Failed to disable MFA.')
      );
    } finally {
      this.mfaBusy = false;
      this.mfaConfirm = null;
      await this.load();
    }
  }

  private renderMfaConfirmDialog() {
    if (!this.mfaConfirm) {
      return nothing;
    }
    return html`
      <confirm-dialog
        .open=${true}
        .busy=${this.mfaBusy}
        .danger=${true}
        .message=${msg(
          str`Two-factor authentication codes (${this.mfaConfirm.join(', ')}) will be removed; the password stays in place.`
        )}
        .confirmLabel=${msg('Disable MFA')}
        @cancel=${this.closeMfaConfirm}
        @confirm=${() => void this.handleDisableMfa()}
      ></confirm-dialog>
    `;
  }

  private get applicationOptions(): { value: string; label: string }[] {
    return this.applications.map((application) => ({
      value: application.id,
      label: application.displayName || application.name || application.id,
    }));
  }

  private applicationLabel(id: string): string {
    const application = this.applications.find((item) => item.id === id);
    return application
      ? application.displayName || application.name || application.id
      : id;
  }

  private openCreateAppPassword(): void {
    this.appPasswordLabel = '';
    this.appPasswordApplication = '';
    this.appPasswordLabelError = '';
    this.appPasswordApplicationError = '';
    this.createdAppPassword = null;
    this.appPasswordModalOpen = true;
  }

  private closeCreateAppPassword(): void {
    if (this.appPasswordBusy) {
      return;
    }
    this.appPasswordModalOpen = false;
    this.createdAppPassword = null;
    this.appPasswordLabel = '';
    this.appPasswordApplication = '';
    this.appPasswordLabelError = '';
    this.appPasswordApplicationError = '';
  }

  private handleAppPasswordSubmit(event: Event): void {
    event.preventDefault();
    void this.handleCreateAppPassword();
  }

  private async handleCreateAppPassword(): Promise<void> {
    if (this.appPasswordBusy) {
      return;
    }
    const label = this.appPasswordLabel.trim();
    const applicationId = this.appPasswordApplication;
    this.appPasswordLabelError = label ? '' : msg('Label is required.');
    this.appPasswordApplicationError = applicationId
      ? ''
      : msg('Application is required.');
    if (!label || !applicationId) {
      return;
    }
    this.appPasswordBusy = true;
    try {
      const created = await authService.withStepUp(() =>
        personService.createApplicationPassword(this.id, applicationId, label)
      );
      this.createdAppPassword = created;
      await this.reloadAppPasswords();
    } catch {
      notificationService.error(
        msg('Failed to create the application password.')
      );
    } finally {
      this.appPasswordBusy = false;
    }
  }

  private async reloadAppPasswords(): Promise<void> {
    try {
      this.appPasswords = await personService.applicationPasswords(this.id);
    } catch {
      // The password was created; keep the list the section already has.
    }
  }

  private notifyAppPasswordCopied(): void {
    notificationService.success(msg('Copied to clipboard.'));
  }

  private renderCreateAppPasswordDialog() {
    const created = this.createdAppPassword;
    return html`
      <modal-dialog
        heading=${msg('Create application password')}
        .open=${this.appPasswordModalOpen}
        .busy=${this.appPasswordBusy}
        @modal-close=${this.closeCreateAppPassword}
      >
        ${created
          ? html`
              <p>
                ${msg(
                  'Application password created. Copy the secret now — it will not be shown again.'
                )}
              </p>
              <p>${created.label}</p>
              <p>${this.applicationLabel(this.appPasswordApplication)}</p>
              <ui-copy-field
                label=${msg('Secret')}
                copy-label=${msg('Copy secret')}
                .value=${created.secret}
                @copied=${this.notifyAppPasswordCopied}
                @copy-failed=${this.notifyCopyFailed}
              ></ui-copy-field>
            `
          : html`
              <form @submit=${this.handleAppPasswordSubmit}>
                <form-field
                  label=${msg('Label')}
                  fieldId="app-password-label"
                  type="text"
                  required
                  .value=${this.appPasswordLabel}
                  .error=${this.appPasswordLabelError}
                  @field-input=${(event: CustomEvent<{ value: string }>) =>
                    (this.appPasswordLabel = event.detail.value)}
                ></form-field>
                <form-field
                  label=${msg('Application')}
                  fieldId="app-password-application"
                  type="combobox"
                  required
                  .value=${this.appPasswordApplication}
                  .options=${this.applicationOptions}
                  .hint=${this.applications.length === 0
                    ? msg('No applications available.')
                    : ''}
                  .error=${this.appPasswordApplicationError}
                  @field-input=${(event: CustomEvent<{ value: string }>) =>
                    (this.appPasswordApplication = event.detail.value)}
                ></form-field>
              </form>
            `}
        <div slot="footer">
          ${created
            ? html`
                <ui-button
                  variant="primary"
                  @click=${this.closeCreateAppPassword}
                >
                  ${msg('Done')}
                </ui-button>
              `
            : html`
                <ui-button
                  ?disabled=${this.appPasswordBusy}
                  @click=${this.closeCreateAppPassword}
                >
                  ${msg('Cancel')}
                </ui-button>
                <ui-button
                  variant="primary"
                  ?loading=${this.appPasswordBusy}
                  ?disabled=${this.applications.length === 0}
                  @click=${this.handleCreateAppPassword}
                >
                  ${msg('Create')}
                </ui-button>
              `}
        </div>
      </modal-dialog>
    `;
  }

  private renderAppPasswordRow(password: PersonApplicationPassword) {
    return html`
      <li>
        <ui-card>
          <div class="cred-row">
            <div class="cred-main">
              <span class="cred-type" title=${password.id}
                >${password.label}</span
              >
              <span class="cred-uuid"
                >${msg(str`Application: ${password.applicationName}`)}</span
              >
            </div>
          </div>
        </ui-card>
      </li>
    `;
  }

  private renderApplicationPasswords() {
    return html`
      <div class="app-passwords">
        <div class="app-passwords-header">
          <h3>${msg('Application passwords')}</h3>
          <ui-button variant="primary" @click=${this.openCreateAppPassword}>
            ${msg('Create application password')}
          </ui-button>
        </div>
        ${this.appPasswords.length === 0
          ? html`<ui-empty-state icon="key"
              >${msg('No application passwords.')}</ui-empty-state
            >`
          : html`
              <ul class="cred-list">
                ${this.appPasswords.map((password) =>
                  this.renderAppPasswordRow(password)
                )}
              </ul>
            `}
      </div>
    `;
  }

  private renderCredRow(cred: { uuid: string; type_: CredentialDetailType }) {
    const hasTotp = this.totpLabelsOf(cred.type_).length > 0;
    return html`
      <li>
        <ui-card interactive>
          <div class="cred-row">
            <div class="cred-main">
              <span class="cred-type">${credentialTypeLabel(cred.type_)}</span>
              <span class="cred-uuid" title=${cred.uuid}>${cred.uuid}</span>
            </div>
            ${hasTotp
              ? html`
                  <ui-button
                    size="sm"
                    variant="danger"
                    @click=${() => this.openMfaConfirm(cred)}
                  >
                    ${msg('Disable MFA')}
                  </ui-button>
                `
              : nothing}
          </div>
        </ui-card>
      </li>
    `;
  }

  private notifyCopied(): void {
    notificationService.success(msg('Reset code copied to clipboard.'));
  }

  private notifyCopyFailed(): void {
    notificationService.error(msg('Failed to copy to clipboard.'));
  }

  private notifyLinkCopied(): void {
    notificationService.success(msg('Reset link copied to clipboard.'));
  }

  private renderIntentPanel() {
    if (!this.intentToken) {
      return nothing;
    }
    const url = this.resetUrl;
    return html`
      <ui-card class="intent-card">
        <div class="intent-body">
          <h4 class="intent-title">${msg('Credential reset link')}</h4>
          <ui-copy-field
            label=${msg('Reset code')}
            copy-label=${msg('Copy code')}
            .value=${this.intentToken}
            @copied=${this.notifyCopied}
            @copy-failed=${this.notifyCopyFailed}
          ></ui-copy-field>
          ${url
            ? html`
                <ui-copy-field
                  label=${msg('Reset link')}
                  copy-label=${msg('Copy link')}
                  .value=${url}
                  @copied=${this.notifyLinkCopied}
                  @copy-failed=${this.notifyCopyFailed}
                ></ui-copy-field>
                <div class="intent-actions">
                  <ui-button
                    icon=${this.qrOpen ? 'chevron-up' : 'chevron-down'}
                    aria-expanded=${this.qrOpen ? 'true' : 'false'}
                    @click=${this.toggleQr}
                  >
                    ${this.qrOpen ? msg('Hide QR code') : msg('Show QR code')}
                  </ui-button>
                </div>
                <ui-qr
                  ?open=${this.qrOpen}
                  .src=${qrDataUrl(url)}
                  alt=${msg('QR code with the credential reset link')}
                  copy-label=${msg('Copy QR image')}
                  @copy=${this.handleCopyQrImage}
                ></ui-qr>
              `
            : nothing}
        </div>
      </ui-card>
    `;
  }

  private renderEmailModal() {
    return html`
      <modal-dialog
        heading=${msg('Email reset link')}
        .open=${this.emailModalOpen}
        .busy=${this.submitting}
        @modal-close=${this.closeEmailModal}
      >
        <form id="email-form" @submit=${this.handleSendEmail}>
          <form-field
            label=${msg('Email address')}
            fieldId="reset-email"
            type="email"
            required
            .value=${this.emailValue}
            @field-input=${(event: CustomEvent<{ value: string }>) =>
              (this.emailValue = event.detail.value)}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key === 'Enter') void this.handleSendEmail(event);
            }}
          ></form-field>
        </form>
        <div slot="footer">
          <ui-button
            ?disabled=${this.submitting}
            @click=${this.closeEmailModal}
          >
            ${msg('Cancel')}
          </ui-button>
          <ui-button
            variant="primary"
            ?loading=${this.submitting}
            ?disabled=${!this.emailValue.trim()}
            @click=${this.handleSendEmail}
          >
            ${msg('Send')}
          </ui-button>
        </div>
      </modal-dialog>
    `;
  }

  render() {
    if (this.loading) {
      return html`
        <div
          class="loading"
          role="status"
          aria-label=${msg('Loading credentials…')}
        >
          <ui-skeleton height="40px"></ui-skeleton>
          <ui-skeleton height="56px" .lines=${2}></ui-skeleton>
        </div>
      `;
    }

    return html`
      <section class="credentials">
        <div class="actions">
          <ui-button
            variant="primary"
            ?loading=${this.submitting}
            @click=${this.handleCreateIntent}
          >
            ${msg('Create credential reset link')}
          </ui-button>
          <ui-button
            icon="mail"
            ?disabled=${this.submitting}
            @click=${this.openEmailModal}
          >
            ${msg('Email reset link')}
          </ui-button>
          <ui-button
            icon="lock"
            ?loading=${this.softlockBusy}
            ?disabled=${this.submitting}
            @click=${this.handleClearSoftlock}
          >
            ${msg('Clear softlock')}
          </ui-button>
        </div>

        ${this.renderIntentPanel()}
        ${this.creds.length === 0
          ? html`<ui-empty-state icon="key"
              >${msg('No credentials enrolled.')}</ui-empty-state
            >`
          : html`
              <ul class="cred-list">
                ${this.creds.map((cred) => this.renderCredRow(cred))}
              </ul>
            `}
        ${this.renderApplicationPasswords()}
      </section>

      ${this.renderEmailModal()} ${this.renderMfaConfirmDialog()}
      ${this.renderCreateAppPasswordDialog()}
    `;
  }

  static styles = personCredentialsTabStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'person-credentials-tab': PersonCredentialsTab;
  }
}
