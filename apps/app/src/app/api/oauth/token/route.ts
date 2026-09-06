import {
  issueOAuthClientCredentialsToken,
  KitsuneError,
} from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';

/**
 * OAuth 2.0 token endpoint (client_credentials).
 * Apps exchange client_id + client_secret for a bearer token that can
 * create databases and CRUD records in the owning Kitsune workspace.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let clientId = '';
    let clientSecret = '';
    let grantType = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      clientId = String(form.get('client_id') ?? '');
      clientSecret = String(form.get('client_secret') ?? '');
      grantType = String(form.get('grant_type') ?? '');
    } else {
      const body = (await request.json()) as {
        client_id?: string;
        client_secret?: string;
        grant_type?: string;
      };
      clientId = body.client_id ?? '';
      clientSecret = body.client_secret ?? '';
      grantType = body.grant_type ?? '';
    }

    if (grantType !== 'client_credentials') {
      throw new KitsuneError(
        'Only grant_type=client_credentials is supported',
        'validation',
      );
    }
    if (!clientId || !clientSecret) {
      throw new KitsuneError(
        'client_id and client_secret are required',
        'validation',
      );
    }

    const token = await issueOAuthClientCredentialsToken(engine.ownerPool, {
      clientId,
      clientSecret,
    });

    return NextResponse.json({
      access_token: token.accessToken,
      token_type: token.tokenType,
      expires_in: token.expiresIn,
      scope: token.scope,
    });
  } catch (error) {
    return jsonError(error);
  }
}
