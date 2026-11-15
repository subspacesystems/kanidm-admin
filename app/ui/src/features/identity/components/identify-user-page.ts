// Identity verification page: read out codes with another person to
// prove to each other who you are (kanidm person validity).

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str } from '@lit/localize';
import { localized } from '@/features/localization';
import { authService } from '@/features/auth';
import { notificationService } from '@/features/notifications';
import '@/shared/components/admin-layout';
import '@/shared/components/form-field';
import '@/shared/components/ui-button';
import '@/shared/components/ui-card';
import '@/shared/components/ui-copy-field';
import {
  getMsLeftFromNow,
  initialState,
  isValidCode,
  parseCode,
  transition,
  type IdentifyState,
} from '../identity-verification.ts';
import { identityService } from '../services/identity.service.ts';
import { identifyUserPageStyles } from './identify-user-page.styles.ts';

type CodeState = Extract<
  IdentifyState,
  { kind: 'displayCodeFirst' | 'displayCodeSecond' }
>;

@customElement('identify-user-page')
@localized()
export class IdentifyUserPage extends LitElement {
  @state() private flow: IdentifyState = transition(initialState(), {
    type: 'started',
    result: { kind: 'available' },
  });
  @state() private otherIdText = '';
  @state() private codeText = '';
  @state() private busy = false;
  @state() private message = '';
  @state() private secondsLeft = 0;

  private countdownTimer: number | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopCountdown();
  }

  private get ownId(): string {
    return authService.getUser()?.username ?? '';
  }

  private setFlow(next: IdentifyState): void {
    this.stopCountdown();
    this.flow = next;
    this.codeText = '';
    if (next.kind === 'displayCodeFirst' || next.kind === 'displayCodeSecond') {
      this.tickCountdown(next);
      this.countdownTimer = window.setInterval(
        () => this.tickCountdown(this.flow),
        1000
      );
    }
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private tickCountdown(flow: IdentifyState): void {
    if (flow.kind !== 'displayCodeFirst' && flow.kind !== 'displayCodeSecond') {
      this.secondsLeft = 0;
      return;
    }
    this.secondsLeft = Math.max(
      0,
      Math.ceil(getMsLeftFromNow(flow.step) / 1000)
    );
  }

  private handleOtherIdInput(event: Event): void {
    this.otherIdText = this.eventValue(event);
  }

  private handleCodeInput(event: Event): void {
    this.codeText = this.eventValue(event);
  }

  private eventValue(event: Event): string {
    return (event as CustomEvent<{ value: string }>).detail.value;
  }

  private handleIdKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.handleStart();
    }
  }

  private handleCodeKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.handleSubmitCode();
    }
  }

  private async handleStart(): Promise<void> {
    const otherId = this.otherIdText.trim();
    if (!otherId || this.busy) {
      return;
    }
    this.busy = true;
    this.message = '';
    try {
      const result = await authService.withStepUp(() =>
        identityService.start(otherId)
      );
      if (result.kind === 'unavailable') {
        this.message = msg(
          'Identity verification is not available for this person.'
        );
      } else {
        this.otherIdText = otherId;
        this.setFlow(
          transition(this.flow, {
            type: 'otherIdSubmitted',
            otherId,
            result,
          })
        );
      }
    } catch {
      notificationService.error(msg('Could not start identity verification.'));
    } finally {
      this.busy = false;
    }
  }

  private async handleSubmitCode(): Promise<void> {
    const flow = this.flow;
    if (flow.kind !== 'submitCode' || this.busy) {
      return;
    }
    const code = parseCode(this.codeText);
    if (code === null) {
      return;
    }
    this.busy = true;
    try {
      const result = await authService.withStepUp(() =>
        identityService.submitCode(flow.otherId, code)
      );
      this.setFlow(transition(this.flow, { type: 'codeSubmitted', result }));
    } catch {
      notificationService.error(msg('Could not submit the code.'));
    } finally {
      this.busy = false;
    }
  }

  private handleConfirm(): void {
    this.setFlow(transition(this.flow, { type: 'confirmed' }));
  }

  private handleDecline(): void {
    this.setFlow(transition(this.flow, { type: 'declined' }));
  }

  private handleStartOver(): void {
    this.otherIdText = '';
    this.codeText = '';
    this.message = '';
    this.setFlow(
      transition(initialState(), {
        type: 'started',
        result: { kind: 'available' },
      })
    );
  }

  private get resultText(): string | null {
    const flow = this.flow;
    switch (flow.kind) {
      case 'success':
        return msg(
          str`Identity verification succeeded. You have verified ${flow.otherId} and they have verified you.`
        );
      case 'unavailable':
        return msg('Identity verification is not available for this person.');
      case 'failed':
        if (flow.reason === 'code') {
          return msg(
            'The verification code is invalid. Check the code with the other person, and if it remains invalid, they may be trying to deceive you.'
          );
        }
        if (flow.reason === 'declined') {
          return msg('Identity verification was cancelled.');
        }
        return msg(
          'Identity verification is in an unexpected state. Start over.'
        );
      default:
        return this.message || null;
    }
  }

  private renderResult() {
    const text = this.resultText;
    if (!text) {
      return nothing;
    }
    const role = this.flow.kind === 'success' ? 'status' : 'alert';
    return html`<p class="result ${role}" data-testid="result" role=${role}>
      ${text}
    </p>`;
  }

  private renderIdStep() {
    return html`
      <ui-card>
        <form @submit=${this.preventSubmit} @keydown=${this.handleIdKeyDown}>
          <form-field
            fieldId="identify-other-id"
            label=${msg("Other person's ID")}
            .value=${this.otherIdText}
            @field-input=${this.handleOtherIdInput}
          ></form-field>
          <div class="actions">
            <ui-button
              variant="primary"
              .disabled=${!this.otherIdText.trim() || this.busy}
              .loading=${this.busy}
              @click=${this.handleStart}
            >
              ${msg('Start verification')}
            </ui-button>
          </div>
        </form>
        ${this.renderResult()}
      </ui-card>
    `;
  }

  private renderCodeStep() {
    return html`
      <ui-card>
        <form @submit=${this.preventSubmit} @keydown=${this.handleCodeKeyDown}>
          <form-field
            fieldId="identify-other-code"
            label=${msg('Their code')}
            .value=${this.codeText}
            hint=${msg('5 or 6 digits.')}
            inputMode="numeric"
            autocomplete="off"
            @field-input=${this.handleCodeInput}
          ></form-field>
          <div class="actions">
            <ui-button
              variant="primary"
              .disabled=${!isValidCode(this.codeText) || this.busy}
              .loading=${this.busy}
              @click=${this.handleSubmitCode}
            >
              ${msg('Submit code')}
            </ui-button>
          </div>
        </form>
      </ui-card>
    `;
  }

  private renderDisplayCode(flow: CodeState) {
    const expired = this.secondsLeft <= 0;
    return html`
      <ui-card>
        <p class="caption">${msg('Read this code to the other person.')}</p>
        <div class="own-code" data-testid="own-code">
          ${String(flow.selfTotp)}
        </div>
        <p
          class="countdown ${expired ? 'expired' : ''}"
          data-testid="countdown"
        >
          ${expired
            ? msg('This code has expired.')
            : msg(str`${this.secondsLeft} seconds left`)}
        </p>
        <p class="confirm">
          ${msg(
            str`Did ${flow.otherId} correctly verify your code? You won't be able to go back.`
          )}
        </p>
        <div class="actions">
          <ui-button
            variant="primary"
            .disabled=${expired}
            @click=${this.handleConfirm}
          >
            ${msg('Yes, they verified my code')}
          </ui-button>
          <ui-button
            variant="secondary"
            .disabled=${expired}
            @click=${this.handleDecline}
          >
            ${msg('No, they did not verify it')}
          </ui-button>
        </div>
        ${expired
          ? html`<div class="actions">
              <ui-button variant="secondary" @click=${this.handleStartOver}>
                ${msg('Start over')}
              </ui-button>
            </div>`
          : nothing}
      </ui-card>
    `;
  }

  private renderTerminal() {
    return html`
      <ui-card>
        ${this.renderResult()}
        <div class="actions">
          <ui-button variant="secondary" @click=${this.handleStartOver}>
            ${msg('Start over')}
          </ui-button>
        </div>
      </ui-card>
    `;
  }

  private renderStep() {
    const flow = this.flow;
    switch (flow.kind) {
      case 'idDisplayAndSubmit':
        return this.renderIdStep();
      case 'submitCode':
        return this.renderCodeStep();
      case 'displayCodeFirst':
      case 'displayCodeSecond':
        return this.renderDisplayCode(flow);
      default:
        return this.renderTerminal();
    }
  }

  private preventSubmit(event: Event): void {
    event.preventDefault();
  }

  render() {
    return html`
      <admin-layout>
        <div class="page-head">
          <h1>${msg('Verify identity')}</h1>
        </div>

        <ui-card>
          <div data-testid="own-id" class="own-id">
            <ui-copy-field
              label=${msg('Your ID')}
              .value=${this.ownId}
              copy-label=${msg('Copy ID')}
            ></ui-copy-field>
          </div>
          <p class="hint">
            ${msg('Read it out when the other person asks for it.')}
          </p>
        </ui-card>

        ${this.renderStep()}
      </admin-layout>
    `;
  }

  static styles = identifyUserPageStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    'identify-user-page': IdentifyUserPage;
  }
}
