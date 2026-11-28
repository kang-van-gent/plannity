import type { Schema, Struct } from '@strapi/strapi';

export interface AdminApiToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_tokens';
  info: {
    description: '';
    displayName: 'Api Token';
    name: 'Api Token';
    pluralName: 'api-tokens';
    singularName: 'api-token';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    adminPermissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::permission'
    >;
    adminUserOwner: Schema.Attribute.Relation<'manyToOne', 'admin::user'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    encryptedKey: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    expiresAt: Schema.Attribute.DateTime;
    kind: Schema.Attribute.Enumeration<['content-api', 'admin']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'content-api'>;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Schema.Attribute.DefaultTo<'read-only'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_token_permissions';
  info: {
    description: '';
    displayName: 'API Token Permission';
    name: 'API Token Permission';
    pluralName: 'api-token-permissions';
    singularName: 'api-token-permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminAuditLog extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_audit_logs';
  info: {
    displayName: 'Audit Log';
    pluralName: 'audit-logs';
    singularName: 'audit-log';
  };
  options: {
    draftAndPublish: false;
    timestamps: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.DateTime & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::audit-log'> &
      Schema.Attribute.Private;
    payload: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<'oneToOne', 'admin::user'>;
  };
}

export interface AdminPermission extends Struct.CollectionTypeSchema {
  collectionName: 'admin_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'Permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    apiToken: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
    conditions: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[]>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::permission'> &
      Schema.Attribute.Private;
    properties: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<'manyToOne', 'admin::role'>;
    subject: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminRole extends Struct.CollectionTypeSchema {
  collectionName: 'admin_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'Role';
    pluralName: 'roles';
    singularName: 'role';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::role'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<'oneToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<'manyToMany', 'admin::user'>;
  };
}

export interface AdminSession extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_sessions';
  info: {
    description: 'Session Manager storage';
    displayName: 'Session';
    name: 'Session';
    pluralName: 'sessions';
    singularName: 'session';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
    i18n: {
      localized: false;
    };
  };
  attributes: {
    absoluteExpiresAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    childId: Schema.Attribute.String & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deviceId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    expiresAt: Schema.Attribute.DateTime &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::session'> &
      Schema.Attribute.Private;
    metadata: Schema.Attribute.JSON & Schema.Attribute.Private;
    origin: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    sessionId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    status: Schema.Attribute.String & Schema.Attribute.Private;
    type: Schema.Attribute.String & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    userId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_tokens';
  info: {
    description: '';
    displayName: 'Transfer Token';
    name: 'Transfer Token';
    pluralName: 'transfer-tokens';
    singularName: 'transfer-token';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    expiresAt: Schema.Attribute.DateTime;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferTokenPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    description: '';
    displayName: 'Transfer Token Permission';
    name: 'Transfer Token Permission';
    pluralName: 'transfer-token-permissions';
    singularName: 'transfer-token-permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::transfer-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminUser extends Struct.CollectionTypeSchema {
  collectionName: 'admin_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'User';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    apiTokens: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
    blocked: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    firstname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    lastname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::user'> &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    preferedLanguage: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    registrationToken: Schema.Attribute.String & Schema.Attribute.Private;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    resetPasswordTokenExpiresAt: Schema.Attribute.DateTime &
      Schema.Attribute.Private;
    roles: Schema.Attribute.Relation<'manyToMany', 'admin::role'> &
      Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String;
  };
}

export interface ApiActivityLogActivityLog extends Struct.CollectionTypeSchema {
  collectionName: 'activity_logs';
  info: {
    description: 'Append-only record of who changed what in a brand, and when. Written by the server only; never edited or deleted through the API.';
    displayName: 'Activity Log';
    pluralName: 'activity-logs';
    singularName: 'activity-log';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60;
      }>;
    actor: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    actorName: Schema.Attribute.String & Schema.Attribute.Required;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    changes: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entityId: Schema.Attribute.String & Schema.Attribute.Required;
    entityTitle: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    entityType: Schema.Attribute.Enumeration<['brand', 'content', 'member']> &
      Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::activity-log.activity-log'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAppSettingAppSetting extends Struct.SingleTypeSchema {
  collectionName: 'app_settings';
  info: {
    description: 'Integration settings managed here instead of server/.env: Social channels (Meta, TikTok), PromptPay, Slip2Go and the mail server (Brevo). A filled field overrides .env; an empty field uses .env. Saved changes apply within seconds, no restart. Secret fields are encrypted when saved (they then show as v1.\u2026): to change one, clear it and paste the new value. Server-only settings (database, JWT, SOCIAL_TOKEN_KEY, PUBLIC_URL) stay in .env.';
    displayName: 'App settings';
    pluralName: 'app-settings';
    singularName: 'app-setting';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brevoApiKey: Schema.Attribute.Text & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::app-setting.app-setting'
    > &
      Schema.Attribute.Private;
    mailEnabled: Schema.Attribute.Boolean;
    mailFromEmail: Schema.Attribute.Email &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 120;
      }>;
    mailFromName: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    mailReplyTo: Schema.Attribute.Email &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 120;
      }>;
    metaAppId: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    metaAppSecret: Schema.Attribute.Text & Schema.Attribute.Private;
    metaGraphVersion: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 10;
      }>;
    metaLoginConfigId: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    paymentOrderTtlMinutes: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 1440;
          min: 5;
        },
        number
      >;
    promptpayId: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 20;
      }>;
    promptpayName: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    promptpayType: Schema.Attribute.Enumeration<
      ['phone_number', 'citizen_id', 'e_wallet']
    >;
    publishedAt: Schema.Attribute.DateTime;
    receiverAccountNumber: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 20;
      }>;
    receiverAccountType: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 5;
      }>;
    receiverBankAccount: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 20;
      }>;
    receiverBankType: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 5;
      }>;
    receiverNameTh: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 120;
      }>;
    slip2goApiUrl: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    slip2goAutoApprove: Schema.Attribute.Boolean;
    slip2goGenerateQr: Schema.Attribute.Boolean;
    slip2goSecretKey: Schema.Attribute.Text & Schema.Attribute.Private;
    slip2goTimeoutMs: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 60000;
          min: 2000;
        },
        number
      >;
    socialTestMode: Schema.Attribute.Boolean;
    tiktokAudited: Schema.Attribute.Boolean;
    tiktokClientKey: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    tiktokClientSecret: Schema.Attribute.Text & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiBlogPostBlogPost extends Struct.CollectionTypeSchema {
  collectionName: 'blog_posts';
  info: {
    description: 'Public articles shown at /blog. Only published entries appear on the site.';
    displayName: 'Blog post';
    pluralName: 'blog-posts';
    singularName: 'blog-post';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    author: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }> &
      Schema.Attribute.DefaultTo<'Plannity Team'>;
    category: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    content: Schema.Attribute.Blocks & Schema.Attribute.Required;
    cover: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    excerpt: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 300;
      }>;
    featured: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::blog-post.blog-post'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    seoDescription: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 160;
      }>;
    seoTitle: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    slug: Schema.Attribute.UID<'title'> & Schema.Attribute.Required;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 160;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiBrandInvitationBrandInvitation
  extends Struct.CollectionTypeSchema {
  collectionName: 'brand_invitations';
  info: {
    description: 'Invitation to join a brand. Only a SHA-256 hash of the token is stored.';
    displayName: 'Brand Invitation';
    pluralName: 'brand-invitations';
    singularName: 'brand-invitation';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    acceptedAt: Schema.Attribute.DateTime;
    acceptedBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email & Schema.Attribute.Required;
    expiresAt: Schema.Attribute.DateTime & Schema.Attribute.Required;
    invitedBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::brand-invitation.brand-invitation'
    > &
      Schema.Attribute.Private;
    pendingKey: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    positionKeys: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Enumeration<['admin', 'editor', 'viewer']> &
      Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<
      ['pending', 'accepted', 'declined', 'cancelled', 'expired']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    tokenHash: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiBrandMembershipBrandMembership
  extends Struct.CollectionTypeSchema {
  collectionName: 'brand_memberships';
  info: {
    description: "A user's role in one brand (Team Workspace). Permissions are derived from this, never from a global user role.";
    displayName: 'Brand Membership';
    pluralName: 'brand-memberships';
    singularName: 'brand-membership';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    joinedAt: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::brand-membership.brand-membership'
    > &
      Schema.Attribute.Private;
    memberKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    positionKeys: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Enumeration<['owner', 'admin', 'editor', 'viewer']> &
      Schema.Attribute.Required;
    roleUpdatedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['active', 'removed']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'active'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiBrandBrand extends Struct.CollectionTypeSchema {
  collectionName: 'brands';
  info: {
    description: 'A brand profile owned by a user (spec \u00A78).';
    displayName: 'Brand';
    pluralName: 'brands';
    singularName: 'brand';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    archivedAt: Schema.Attribute.DateTime;
    color: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 9;
      }> &
      Schema.Attribute.DefaultTo<'#6C4CF5'>;
    contents: Schema.Attribute.Relation<'oneToMany', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    invitations: Schema.Attribute.Relation<
      'oneToMany',
      'api::brand-invitation.brand-invitation'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::brand.brand'> &
      Schema.Attribute.Private;
    maxSeats: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    memberships: Schema.Attribute.Relation<
      'oneToMany',
      'api::brand-membership.brand-membership'
    >;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    profile: Schema.Attribute.JSON & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiContentRevisionContentRevision
  extends Struct.CollectionTypeSchema {
  collectionName: 'content_revisions';
  info: {
    description: 'Immutable snapshot kept on edit/regenerate.';
    displayName: 'Content Revision';
    pluralName: 'content-revisions';
    singularName: 'content-revision';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    content: Schema.Attribute.Relation<'manyToOne', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::content-revision.content-revision'
    > &
      Schema.Attribute.Private;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.Enumeration<['create', 'edit', 'regenerate']> &
      Schema.Attribute.Required;
    snapshot: Schema.Attribute.JSON & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    version: Schema.Attribute.Integer & Schema.Attribute.Required;
  };
}

export interface ApiContentContent extends Struct.CollectionTypeSchema {
  collectionName: 'contents';
  info: {
    description: 'One planned content item; fields follow the AI output contract (spec \u00A79\u201310).';
    displayName: 'Content';
    pluralName: 'contents';
    singularName: 'content';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    archivedAt: Schema.Attribute.DateTime;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    caption: Schema.Attribute.Text;
    concept: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    cta: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 300;
      }>;
    destinations: Schema.Attribute.Relation<
      'oneToMany',
      'api::publish-destination.publish-destination'
    >;
    format: Schema.Attribute.Enumeration<
      ['static', 'carousel', 'short_video', 'text']
    > &
      Schema.Attribute.Required;
    hashtags: Schema.Attribute.JSON;
    hook: Schema.Attribute.Text;
    imageOrder: Schema.Attribute.JSON & Schema.Attribute.Private;
    images: Schema.Attribute.Media<'images', true>;
    jobItemId: Schema.Attribute.String & Schema.Attribute.Unique;
    lastEditedBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::content.content'
    > &
      Schema.Attribute.Private;
    objective: Schema.Attribute.Enumeration<
      ['awareness', 'engagement', 'consideration', 'conversion']
    > &
      Schema.Attribute.DefaultTo<'engagement'>;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    pillar: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    platform: Schema.Attribute.Enumeration<
      ['facebook', 'instagram', 'tiktok', 'youtube', 'line', 'x', 'linkedin']
    > &
      Schema.Attribute.Required;
    postedAt: Schema.Attribute.DateTime;
    postUrl: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    rationale: Schema.Attribute.Text;
    scheduledDate: Schema.Attribute.Date;
    scheduledTime: Schema.Attribute.String;
    source: Schema.Attribute.Enumeration<['ai', 'manual']> &
      Schema.Attribute.DefaultTo<'manual'>;
    status: Schema.Attribute.Enumeration<
      ['draft', 'in_review', 'approved', 'scheduled', 'published']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'draft'>;
    suggestedDate: Schema.Attribute.Date;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    version: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<1>;
    videoScript: Schema.Attribute.Text;
    visualBrief: Schema.Attribute.Text;
  };
}

export interface ApiCreditLedgerCreditLedger
  extends Struct.CollectionTypeSchema {
  collectionName: 'credit_ledgers';
  info: {
    description: 'Append-only ledger; operationKey unique makes every operation idempotent.';
    displayName: 'Credit Ledger Entry';
    pluralName: 'credit-ledgers';
    singularName: 'credit-ledger';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    availableAfter: Schema.Attribute.Integer & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deltaAvailable: Schema.Attribute.Integer & Schema.Attribute.Required;
    deltaReserved: Schema.Attribute.Integer & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::credit-ledger.credit-ledger'
    > &
      Schema.Attribute.Private;
    operationKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    refId: Schema.Attribute.String;
    refType: Schema.Attribute.Enumeration<['job', 'item', 'payment']>;
    type: Schema.Attribute.Enumeration<
      ['trial_grant', 'purchase', 'reserve', 'consume', 'release', 'adjustment']
    > &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    wallet: Schema.Attribute.Relation<
      'manyToOne',
      'api::credit-wallet.credit-wallet'
    >;
  };
}

export interface ApiCreditWalletCreditWallet
  extends Struct.CollectionTypeSchema {
  collectionName: 'credit_wallets';
  info: {
    description: 'One per user. CHECK(available>=0, reserved>=0) added by migration.';
    displayName: 'Credit Wallet';
    pluralName: 'credit-wallets';
    singularName: 'credit-wallet';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    available: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::credit-wallet.credit-wallet'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    reserved: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::users-permissions.user'
    >;
    version: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiFeedbackFeedback extends Struct.CollectionTypeSchema {
  collectionName: 'feedbacks';
  info: {
    description: 'User feedback, optionally about a content item.';
    displayName: 'Feedback';
    pluralName: 'feedbacks';
    singularName: 'feedback';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    comment: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }>;
    content: Schema.Attribute.Relation<'manyToOne', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::feedback.feedback'
    > &
      Schema.Attribute.Private;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    rating: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 5;
          min: 1;
        },
        number
      >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiGenerationItemGenerationItem
  extends Struct.CollectionTypeSchema {
  collectionName: 'generation_items';
  info: {
    description: 'One unit of work inside a job; unique (job, ordinal) enforced by migration.';
    displayName: 'Generation Item';
    pluralName: 'generation-items';
    singularName: 'generation-item';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    attempts: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    content: Schema.Attribute.Relation<'oneToOne', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    errorCode: Schema.Attribute.String;
    job: Schema.Attribute.Relation<
      'manyToOne',
      'api::generation-job.generation-job'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::generation-item.generation-item'
    > &
      Schema.Attribute.Private;
    ordinal: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['pending', 'running', 'succeeded', 'failed', 'cancelled']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiGenerationJobGenerationJob
  extends Struct.CollectionTypeSchema {
  collectionName: 'generation_jobs';
  info: {
    description: 'A request to generate N items (spec \u00A718). Created only by the custom generation controller.';
    displayName: 'Generation Job';
    pluralName: 'generation-jobs';
    singularName: 'generation-job';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    brandName: Schema.Attribute.String;
    brandSnapshot: Schema.Attribute.JSON;
    cancelledCount: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    completedCount: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    failedCount: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    idempotencyKey: Schema.Attribute.String & Schema.Attribute.Required;
    inputSnapshot: Schema.Attribute.JSON & Schema.Attribute.Required;
    items: Schema.Attribute.Relation<
      'oneToMany',
      'api::generation-item.generation-item'
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::generation-job.generation-job'
    > &
      Schema.Attribute.Private;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    requestedCount: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 30;
          min: 1;
        },
        number
      >;
    status: Schema.Attribute.Enumeration<
      ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'queued'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiHolidayHoliday extends Struct.CollectionTypeSchema {
  collectionName: 'holidays';
  info: {
    description: 'Curated Thai key dates (owner empty) plus user-added ones.';
    displayName: 'Holiday';
    pluralName: 'holidays';
    singularName: 'holiday';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    country: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 2;
      }> &
      Schema.Attribute.DefaultTo<'TH'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date & Schema.Attribute.Required;
    kind: Schema.Attribute.Enumeration<
      ['holiday', 'observance', 'shopping', 'custom']
    > &
      Schema.Attribute.DefaultTo<'custom'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::holiday.holiday'
    > &
      Schema.Attribute.Private;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    publishedAt: Schema.Attribute.DateTime;
    source: Schema.Attribute.String & Schema.Attribute.Required;
    title: Schema.Attribute.JSON & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    verified: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    year: Schema.Attribute.Integer & Schema.Attribute.Required;
  };
}

export interface ApiPaymentAttemptPaymentAttempt
  extends Struct.CollectionTypeSchema {
  collectionName: 'payment_attempts';
  info: {
    description: 'One uploaded slip for an order and what Slip2Go answered. Saved before the provider is called. The slip file itself is stored privately (open it with Slip link).';
    displayName: 'Payment Attempt';
    pluralName: 'payment-attempts';
    singularName: 'payment-attempt';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    attemptKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    completedAt: Schema.Attribute.DateTime;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    failureReason: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }>;
    fileHash: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 64;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::payment-attempt.payment-attempt'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Relation<
      'manyToOne',
      'api::payment-order.payment-order'
    >;
    providerCode: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 12;
      }>;
    providerReferenceId: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 120;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    requester: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    result: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    sanitizedResult: Schema.Attribute.JSON & Schema.Attribute.Private;
    slipLink: Schema.Attribute.String & Schema.Attribute.Private;
    status: Schema.Attribute.Enumeration<
      ['pending', 'passed', 'rejected', 'retry', 'review', 'manual', 'error']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    storageKey: Schema.Attribute.String & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPaymentClaimPaymentClaim
  extends Struct.CollectionTypeSchema {
  collectionName: 'payment_claims';
  info: {
    description: 'A bank transfer that paid an order. Globally unique by sender bank + transaction reference (and QR digest): one transfer can pay for one order only.';
    displayName: 'Payment Claim';
    pluralName: 'payment-claims';
    singularName: 'payment-claim';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amountSatang: Schema.Attribute.BigInteger & Schema.Attribute.Required;
    approvedBy: Schema.Attribute.Enumeration<['slip2go', 'staff']> &
      Schema.Attribute.Required;
    claimKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::payment-claim.payment-claim'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Relation<
      'manyToOne',
      'api::payment-order.payment-order'
    >;
    orderKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    providerReferenceId: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 120;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    qrDigest: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    senderBankId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 10;
      }>;
    transferAt: Schema.Attribute.DateTime & Schema.Attribute.Required;
    transRef: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPaymentEventPaymentEvent
  extends Struct.CollectionTypeSchema {
  collectionName: 'payment_events';
  info: {
    description: 'Verified provider webhook events; providerEventId unique prevents double grants.';
    displayName: 'Payment Event';
    pluralName: 'payment-events';
    singularName: 'payment-event';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::payment-event.payment-event'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Relation<
      'manyToOne',
      'api::payment-order.payment-order'
    >;
    processedAt: Schema.Attribute.DateTime;
    providerEventId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPaymentOrderPaymentOrder
  extends Struct.CollectionTypeSchema {
  collectionName: 'payment_orders';
  info: {
    description: 'PromptPay: pending \u2192 verifying (slip being checked by Slip2Go) \u2192 paid / rejected / awaiting_review (staff). Money in satang. Set status to paid to approve manually \u2014 delivery happens exactly once per order.';
    displayName: 'Payment Order';
    pluralName: 'payment-orders';
    singularName: 'payment-order';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    amountSatang: Schema.Attribute.BigInteger & Schema.Attribute.Required;
    brandIds: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    credits: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    currency: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 3;
      }> &
      Schema.Attribute.DefaultTo<'THB'>;
    expiresAt: Schema.Attribute.DateTime;
    fulfilledAt: Schema.Attribute.DateTime;
    kind: Schema.Attribute.Enumeration<
      ['credits', 'plan', 'brand_addon', 'renewal']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'credits'>;
    leaseToken: Schema.Attribute.String & Schema.Attribute.Private;
    leaseUntil: Schema.Attribute.DateTime & Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::payment-order.payment-order'
    > &
      Schema.Attribute.Private;
    paidAt: Schema.Attribute.DateTime;
    planKey: Schema.Attribute.Enumeration<['team', 'studio']>;
    provider: Schema.Attribute.String & Schema.Attribute.Required;
    providerRef: Schema.Attribute.String & Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    qrPayload: Schema.Attribute.Text;
    qrSource: Schema.Attribute.Enumeration<['slip2go', 'local']> &
      Schema.Attribute.DefaultTo<'local'>;
    quantity: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    receiverSnapshot: Schema.Attribute.JSON & Schema.Attribute.Private;
    reference: Schema.Attribute.String &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 20;
      }>;
    resultCode: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    reviewNote: Schema.Attribute.Text;
    slip: Schema.Attribute.Media<'images'> & Schema.Attribute.Private;
    slipLink: Schema.Attribute.String & Schema.Attribute.Private;
    slipUploadedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      [
        'pending',
        'verifying',
        'awaiting_review',
        'paid',
        'rejected',
        'failed',
        'expired',
        'refunded',
      ]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    verification: Schema.Attribute.JSON & Schema.Attribute.Private;
    verifiedBy: Schema.Attribute.Enumeration<['staff', 'slip2go']>;
  };
}

export interface ApiPromotionInquiryPromotionInquiry
  extends Struct.CollectionTypeSchema {
  collectionName: 'promotion_inquiries';
  info: {
    description: 'Upstify service request; shared only with explicit consent (spec \u00A713).';
    displayName: 'Promotion Inquiry';
    pluralName: 'promotion-inquiries';
    singularName: 'promotion-inquiry';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    brief: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }>;
    budgetSatang: Schema.Attribute.BigInteger;
    contactConsentAt: Schema.Attribute.DateTime & Schema.Attribute.Required;
    content: Schema.Attribute.Relation<'manyToOne', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::promotion-inquiry.promotion-inquiry'
    > &
      Schema.Attribute.Private;
    objective: Schema.Attribute.Enumeration<
      ['awareness', 'engagement', 'consideration', 'conversion']
    >;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    platform: Schema.Attribute.Enumeration<
      ['facebook', 'instagram', 'tiktok', 'youtube', 'line', 'x', 'linkedin']
    >;
    postUrl: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    reference: Schema.Attribute.String & Schema.Attribute.Unique;
    serviceType: Schema.Attribute.Enumeration<
      ['creator_collab', 'community_promo', 'campaign_consult']
    > &
      Schema.Attribute.Required;
    status: Schema.Attribute.Enumeration<
      ['submitted', 'contacted', 'quoted', 'closed']
    > &
      Schema.Attribute.DefaultTo<'submitted'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPublishDestinationPublishDestination
  extends Struct.CollectionTypeSchema {
  collectionName: 'publish_destinations';
  info: {
    description: 'Where one content item goes: one row per platform. Caption/media/time inherit from the content unless overridden (null = inherit). Written only through /contents/:id/destinations and /destinations/:id/* (plannity-context-social-publishing.md \u00A73).';
    displayName: 'Publish destination';
    pluralName: 'publish-destinations';
    singularName: 'publish-destination';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    addedBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    approvedRevision: Schema.Attribute.Integer;
    attemptCount: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    captionOverride: Schema.Attribute.Text;
    content: Schema.Attribute.Relation<'manyToOne', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    destinationKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    externalJobId: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    externalPostId: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    externalPostUrl: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }>;
    idempotencyKey: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    lastErrorCode: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    lastErrorMessage: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 300;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::publish-destination.publish-destination'
    > &
      Schema.Attribute.Private;
    mediaOverrideIds: Schema.Attribute.JSON;
    mode: Schema.Attribute.Enumeration<['manual', 'auto']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'manual'>;
    nextAttemptAt: Schema.Attribute.DateTime;
    options: Schema.Attribute.JSON;
    platform: Schema.Attribute.Enumeration<
      ['facebook', 'instagram', 'tiktok', 'youtube', 'line', 'x', 'linkedin']
    > &
      Schema.Attribute.Required;
    postedAt: Schema.Attribute.DateTime;
    publishedAt: Schema.Attribute.DateTime;
    publishStartedAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    revision: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<1>;
    scheduledAt: Schema.Attribute.DateTime;
    scheduledBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    status: Schema.Attribute.Enumeration<
      [
        'draft',
        'scheduled',
        'publishing',
        'published',
        'failed',
        'reconciling',
        'cancelled',
        'paused',
      ]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'draft'>;
    timezone: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 64;
      }> &
      Schema.Attribute.DefaultTo<'Asia/Bangkok'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSiteSettingSiteSetting extends Struct.SingleTypeSchema {
  collectionName: 'site_settings';
  info: {
    description: 'SEO & analytics for the public website: Google Analytics / Tag Manager and Google Search Console. Changes reach the site within a minute.';
    displayName: 'Site settings';
    pluralName: 'site-settings';
    singularName: 'site-setting';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    analyticsEnabled: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    googleAnalyticsId: Schema.Attribute.String;
    googleSiteVerification: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 400;
      }>;
    googleTagManagerId: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::site-setting.site-setting'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    requireCookieConsent: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<true>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSocialConnectionSocialAuthRequest
  extends Struct.CollectionTypeSchema {
  collectionName: 'social_auth_requests';
  info: {
    description: "One OAuth attempt to connect a brand's accounts. The state sent to Meta/TikTok is stored only as a hash, is single-use and expires after 15 minutes. Meta Pages waiting to be chosen are kept encrypted for that time.";
    displayName: 'Social auth request';
    pluralName: 'social-auth-requests';
    singularName: 'social-auth-request';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    choicesEnc: Schema.Attribute.Text & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    errorCode: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    expiresAt: Schema.Attribute.DateTime & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-connection.social-auth-request'
    > &
      Schema.Attribute.Private;
    provider: Schema.Attribute.Enumeration<['meta', 'tiktok']> &
      Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    stateHash: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    status: Schema.Attribute.Enumeration<
      ['pending', 'exchanging', 'choosing', 'completed', 'failed']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    user: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
  };
}

export interface ApiSocialConnectionSocialConnection
  extends Struct.CollectionTypeSchema {
  collectionName: 'social_connections';
  info: {
    description: "A brand's connected Facebook Page, Instagram professional account or TikTok account (plannity-context-social-publishing.md \u00A73). One per brand and platform. Tokens are encrypted and never leave the server.";
    displayName: 'Social connection';
    pluralName: 'social-connections';
    singularName: 'social-connection';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    accessTokenEnc: Schema.Attribute.Text & Schema.Attribute.Private;
    avatarUrl: Schema.Attribute.Text;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    connectedAt: Schema.Attribute.DateTime;
    connectedBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    connectionKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    displayName: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    externalAccountId: Schema.Attribute.String & Schema.Attribute.Required;
    lastCheck: Schema.Attribute.JSON;
    lastCheckedAt: Schema.Attribute.DateTime;
    lastCheckError: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    lastCheckOk: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::social-connection.social-connection'
    > &
      Schema.Attribute.Private;
    parentAccountId: Schema.Attribute.String;
    platform: Schema.Attribute.Enumeration<
      ['facebook', 'instagram', 'tiktok']
    > &
      Schema.Attribute.Required;
    provider: Schema.Attribute.Enumeration<['meta', 'tiktok']> &
      Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    refreshExpiresAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    refreshTokenEnc: Schema.Attribute.Text & Schema.Attribute.Private;
    scopes: Schema.Attribute.JSON;
    status: Schema.Attribute.Enumeration<['connected', 'reconnect_required']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'connected'>;
    tokenExpiresAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
  };
}

export interface ApiSubscriptionAddOnSubscriptionAddOn
  extends Struct.CollectionTypeSchema {
  collectionName: 'subscription_add_ons';
  info: {
    description: 'One month of cover for one extra owned brand (\u0E3F99) \u2014 or an unused slot waiting for a new brand (brand empty). Renewals start where the previous month ends. Brands without cover are locked (read-only), never deleted.';
    displayName: 'Brand Slot';
    pluralName: 'subscription-add-ons';
    singularName: 'subscription-add-on';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::subscription-add-on.subscription-add-on'
    > &
      Schema.Attribute.Private;
    orderKey: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    periodEnd: Schema.Attribute.DateTime & Schema.Attribute.Required;
    periodStart: Schema.Attribute.DateTime & Schema.Attribute.Required;
    providerReference: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    quantity: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    status: Schema.Attribute.Enumeration<['active', 'cancelled']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'active'>;
    type: Schema.Attribute.Enumeration<['brand']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'brand'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiSubscriptionSubscription
  extends Struct.CollectionTypeSchema {
  collectionName: 'subscriptions';
  info: {
    description: "One paid month of a plan for an account (pricing.md). Created when a plan order is marked paid; the account's plan = the highest active period covering now. Set status to cancelled to revoke.";
    displayName: 'Subscription';
    pluralName: 'subscriptions';
    singularName: 'subscription';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::subscription.subscription'
    > &
      Schema.Attribute.Private;
    orderKey: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    owner: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    periodEnd: Schema.Attribute.DateTime & Schema.Attribute.Required;
    periodStart: Schema.Attribute.DateTime & Schema.Attribute.Required;
    planKey: Schema.Attribute.Enumeration<['team', 'studio']> &
      Schema.Attribute.Required;
    providerReference: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['active', 'cancelled']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'active'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiTaskEventTaskEvent extends Struct.CollectionTypeSchema {
  collectionName: 'task_events';
  info: {
    description: 'Append-only history of a task: who moved it, from what, to what, when.';
    displayName: 'Task Event';
    pluralName: 'task-events';
    singularName: 'task-event';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    actor: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    actorName: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 120;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    fromStatus: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 30;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::task-event.task-event'
    > &
      Schema.Attribute.Private;
    note: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 1000;
      }>;
    publishedAt: Schema.Attribute.DateTime;
    task: Schema.Attribute.Relation<'manyToOne', 'api::task.task'>;
    toStatus: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 30;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiTaskTask extends Struct.CollectionTypeSchema {
  collectionName: 'tasks';
  info: {
    description: "Design work assigned on a post (Team/Studio brands). Separate from the post's own status; history is kept, never deleted.";
    displayName: 'Task';
    pluralName: 'tasks';
    singularName: 'task';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    activeKey: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    assignedBy: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.user'
    >;
    assignee: Schema.Attribute.Relation<
      'manyToOne',
      'api::brand-membership.brand-membership'
    >;
    brand: Schema.Attribute.Relation<'manyToOne', 'api::brand.brand'>;
    briefSnapshot: Schema.Attribute.Text;
    briefVersion: Schema.Attribute.Integer;
    completedAt: Schema.Attribute.DateTime;
    content: Schema.Attribute.Relation<'manyToOne', 'api::content.content'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    dueDate: Schema.Attribute.Date;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::task.task'> &
      Schema.Attribute.Private;
    note: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 1000;
      }>;
    positionKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 40;
      }>;
    priority: Schema.Attribute.Enumeration<['normal', 'high']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'normal'>;
    publishedAt: Schema.Attribute.DateTime;
    reviewNote: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 1000;
      }>;
    status: Schema.Attribute.Enumeration<
      [
        'todo',
        'in_progress',
        'in_review',
        'changes_requested',
        'completed',
        'cancelled',
      ]
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'todo'>;
    type: Schema.Attribute.Enumeration<['design']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'design'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    version: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<1>;
  };
}

export interface PluginContentReleasesRelease
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_releases';
  info: {
    displayName: 'Release';
    pluralName: 'releases';
    singularName: 'release';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    actions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    failureReason: Schema.Attribute.Enumeration<
      ['missed_schedule', 'failed_before_upgrade']
    >;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    releaseCondition: Schema.Attribute.Enumeration<
      ['all_or_nothing', 'allow_partial']
    > &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'all_or_nothing'>;
    releasedAt: Schema.Attribute.DateTime;
    scheduledAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'partial', 'empty']
    > &
      Schema.Attribute.Required;
    timezone: Schema.Attribute.String;
    totalPublishedEntries: Schema.Attribute.Integer;
    totalSkippedEntries: Schema.Attribute.Integer;
    totalUnpublishedEntries: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_release_actions';
  info: {
    displayName: 'Release Action';
    pluralName: 'release-actions';
    singularName: 'release-action';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentType: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entryDocumentId: Schema.Attribute.String;
    isEntryValid: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    > &
      Schema.Attribute.Private;
    outcome: Schema.Attribute.Enumeration<
      [
        'published',
        'unpublished',
        'skipped_invalid',
        'skipped_not_approved',
        'skipped_error',
        'skipped_held',
        'skipped_missed',
      ]
    >;
    publishedAt: Schema.Attribute.DateTime;
    reason: Schema.Attribute.JSON;
    release: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::content-releases.release'
    >;
    type: Schema.Attribute.Enumeration<['publish', 'unpublish']> &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginI18NLocale extends Struct.CollectionTypeSchema {
  collectionName: 'i18n_locale';
  info: {
    collectionName: 'locales';
    description: '';
    displayName: 'Locale';
    pluralName: 'locales';
    singularName: 'locale';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Schema.Attribute.String & Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::i18n.locale'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.SetMinMax<
        {
          max: 50;
          min: 1;
        },
        number
      >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflow
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows';
  info: {
    description: '';
    displayName: 'Workflow';
    name: 'Workflow';
    pluralName: 'workflows';
    singularName: 'workflow';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentTypes: Schema.Attribute.JSON &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'[]'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    stageRequiredToPublish: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::review-workflows.workflow-stage'
    >;
    stages: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflowStage
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows_stages';
  info: {
    description: '';
    displayName: 'Stages';
    name: 'Workflow Stage';
    pluralName: 'workflow-stages';
    singularName: 'workflow-stage';
  };
  options: {
    draftAndPublish: false;
    version: '1.1.0';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    color: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#4945FF'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    permissions: Schema.Attribute.Relation<'manyToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    workflow: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::review-workflows.workflow'
    >;
  };
}

export interface PluginUploadFile extends Struct.CollectionTypeSchema {
  collectionName: 'files';
  info: {
    description: '';
    displayName: 'File';
    pluralName: 'files';
    singularName: 'file';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    alternativeText: Schema.Attribute.Text;
    caption: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    ext: Schema.Attribute.String;
    focalPoint: Schema.Attribute.JSON;
    folder: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'> &
      Schema.Attribute.Private;
    folderPath: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    formats: Schema.Attribute.JSON;
    hash: Schema.Attribute.String & Schema.Attribute.Required;
    height: Schema.Attribute.Integer;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.file'
    > &
      Schema.Attribute.Private;
    mime: Schema.Attribute.String & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    previewUrl: Schema.Attribute.Text;
    provider: Schema.Attribute.String & Schema.Attribute.Required;
    provider_metadata: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    related: Schema.Attribute.Relation<'morphToMany'>;
    size: Schema.Attribute.Decimal & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.Text & Schema.Attribute.Required;
    width: Schema.Attribute.Integer;
  };
}

export interface PluginUploadFolder extends Struct.CollectionTypeSchema {
  collectionName: 'upload_folders';
  info: {
    displayName: 'Folder';
    pluralName: 'folders';
    singularName: 'folder';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    children: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.folder'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    files: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.file'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.folder'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    parent: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'>;
    path: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    pathId: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'role';
    pluralName: 'roles';
    singularName: 'role';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.role'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.String & Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface PluginUsersPermissionsUser
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'user';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
    timestamps: true;
  };
  attributes: {
    blocked: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    confirmationToken: Schema.Attribute.String & Schema.Attribute.Private;
    confirmed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 80;
      }>;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    provider: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ContentTypeSchemas {
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::audit-log': AdminAuditLog;
      'admin::permission': AdminPermission;
      'admin::role': AdminRole;
      'admin::session': AdminSession;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'admin::user': AdminUser;
      'api::activity-log.activity-log': ApiActivityLogActivityLog;
      'api::app-setting.app-setting': ApiAppSettingAppSetting;
      'api::blog-post.blog-post': ApiBlogPostBlogPost;
      'api::brand-invitation.brand-invitation': ApiBrandInvitationBrandInvitation;
      'api::brand-membership.brand-membership': ApiBrandMembershipBrandMembership;
      'api::brand.brand': ApiBrandBrand;
      'api::content-revision.content-revision': ApiContentRevisionContentRevision;
      'api::content.content': ApiContentContent;
      'api::credit-ledger.credit-ledger': ApiCreditLedgerCreditLedger;
      'api::credit-wallet.credit-wallet': ApiCreditWalletCreditWallet;
      'api::feedback.feedback': ApiFeedbackFeedback;
      'api::generation-item.generation-item': ApiGenerationItemGenerationItem;
      'api::generation-job.generation-job': ApiGenerationJobGenerationJob;
      'api::holiday.holiday': ApiHolidayHoliday;
      'api::payment-attempt.payment-attempt': ApiPaymentAttemptPaymentAttempt;
      'api::payment-claim.payment-claim': ApiPaymentClaimPaymentClaim;
      'api::payment-event.payment-event': ApiPaymentEventPaymentEvent;
      'api::payment-order.payment-order': ApiPaymentOrderPaymentOrder;
      'api::promotion-inquiry.promotion-inquiry': ApiPromotionInquiryPromotionInquiry;
      'api::publish-destination.publish-destination': ApiPublishDestinationPublishDestination;
      'api::site-setting.site-setting': ApiSiteSettingSiteSetting;
      'api::social-connection.social-auth-request': ApiSocialConnectionSocialAuthRequest;
      'api::social-connection.social-connection': ApiSocialConnectionSocialConnection;
      'api::subscription-add-on.subscription-add-on': ApiSubscriptionAddOnSubscriptionAddOn;
      'api::subscription.subscription': ApiSubscriptionSubscription;
      'api::task-event.task-event': ApiTaskEventTaskEvent;
      'api::task.task': ApiTaskTask;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::review-workflows.workflow': PluginReviewWorkflowsWorkflow;
      'plugin::review-workflows.workflow-stage': PluginReviewWorkflowsWorkflowStage;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
    }
  }
}
