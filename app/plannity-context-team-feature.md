# Plannity — Team Workspace Feature Context

## Purpose

This document is the implementation context for a dedicated feature branch that adds **team collaboration inside a Plannity Brand Workspace**.

The objective is to let multiple people work on the same brand without turning Plannity into a full project-management platform.

Example:

- Content person creates the plan and caption.
- Graphic designer opens the same content item and uploads the finished artwork.
- Reviewer checks the work.
- Owner manages members and permissions.

The team model should be simple, brand-scoped, and compatible with Plannity's future Team pricing package.

---

## Product Context

Plannity supports multiple brands.

A brand is the main collaboration boundary.

Users should not be invited to the entire Plannity account by default.

They should be invited to a specific Brand Workspace.

Example:

```text
User A
├─ Brand: Bepen      -> Owner
├─ Brand: Upstify    -> Content
└─ Brand: Client X   -> Viewer
```

The same user may therefore have different roles in different brands.

---

## Scope

### In Scope

1. Invite a user to a brand by email.
2. Brand-scoped membership.
3. Multiple team members per brand.
4. Role-based permissions.
5. Member list.
6. Change member role.
7. Remove member from brand.
8. Pending invitation state.
9. Accept invitation.
10. Decline invitation.
11. Resend invitation.
12. Cancel pending invitation.
13. Basic collaboration visibility.
14. Permission compatibility with content editing and image uploads.
15. Team-seat limit support for future paid plans.

### Out of Scope

Do not implement the following in this branch:

- Real-time collaborative text editing
- Chat
- Direct messages
- Kanban project management
- Time tracking
- Payroll
- Complex department hierarchy
- Custom permission builder
- Organization-wide SSO
- Enterprise audit exports
- Automatic billing provider integration unless already present
- Social auto-posting
- AI image generation
- Advanced approval automation

---

## Collaboration Model

Use:

```text
User
  ↕
BrandMembership
  ↕
Brand
```

Do not store one global role directly on the user for brand collaboration.

The user's permission must be derived from their membership in the current brand.

---

## Roles

Use four MVP roles.

### Owner

Highest brand-level permission.

Can:

- View brand
- Edit brand settings
- Delete brand
- Invite members
- Remove members
- Change roles
- Manage content
- Upload/remove post images
- Manage brand-level billing/plan UI
- Transfer ownership in the future

There must always be at least one Owner.

For MVP, the original brand creator is the Owner.

---

### Admin

Can:

- View brand
- Edit brand settings
- Invite members
- Remove non-owner members
- Change roles except assigning/removing Owner unless explicitly allowed
- Create/edit/delete content
- Upload/remove content images
- Manage calendar content

Cannot:

- Delete the brand
- Remove the final Owner
- Perform ownership-sensitive actions

---

### Editor

This is the working role for Content and Graphic team members.

Can:

- View brand
- View calendar
- Create content
- Edit content
- Upload content images
- Replace/remove content images
- Change normal content workflow fields

Cannot:

- Change brand ownership
- Manage billing
- Invite/remove team members
- Delete the brand

For MVP, do not split Content and Graphic into separate permission roles.

Use one `Editor` role.

The UI can later allow labels such as:

- Content
- Graphic
- Social Media

but these labels should not affect permissions in this branch.

---

### Viewer

Can:

- View brand
- View calendar
- View content
- Preview/download content images

Cannot:

- Create content
- Edit content
- Upload/remove images
- Delete content
- Manage members
- Modify brand settings

This role can later become the basis of an Approver/Client role.

---

## Permission Matrix

| Action | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| View brand | Yes | Yes | Yes | Yes |
| Edit brand settings | Yes | Yes | No | No |
| Delete brand | Yes | No | No | No |
| Invite members | Yes | Yes | No | No |
| View members | Yes | Yes | Yes | Yes |
| Change member roles | Yes | Limited | No | No |
| Remove members | Yes | Limited | No | No |
| Create content | Yes | Yes | Yes | No |
| Edit content | Yes | Yes | Yes | No |
| Delete content | Yes | Yes | Yes | No |
| Upload post image | Yes | Yes | Yes | No |
| Remove post image | Yes | Yes | Yes | No |
| Download post image | Yes | Yes | Yes | Yes |
| View calendar | Yes | Yes | Yes | Yes |

`Limited` means the Admin cannot perform owner-sensitive membership changes.

---

## Team Package Concept

The technical design should support seat limits, even if payment integration is not implemented in this branch.

Recommended conceptual products:

```text
Solo
- 1 member

Team
- configurable number of seats
- invite collaborators
```

Do not hardcode commercial pricing.

Store or expose a configurable limit such as:

```text
brand.maxSeats
```

or derive it from the subscription/plan service if one already exists.

---

## Seat Counting

Recommended rule:

Count:

- Active members
- Pending invitations

Reason:

A user should not be able to bypass the seat limit by creating unlimited pending invitations.

Example:

```text
Team plan seats: 5

Active members: 4
Pending invites: 1

Available seats: 0
```

Cancelled, declined, and expired invitations should not count.

---

## Invitation Flow

### Invite

Owner/Admin opens:

`Brand Settings -> Team`

Clicks:

`Invite member`

Inputs:

- Email
- Role

Example:

```text
Email: designer@example.com
Role: Editor

[Send invite]
```

---

## Existing Plannity User

If the email already belongs to a Plannity user:

1. Create pending BrandInvitation.
2. Notify user.
3. User accepts.
4. Create/activate BrandMembership.
5. Invitation becomes accepted.

Do not automatically add the user without acceptance unless the current project explicitly uses auto-accept internal invitations.

---

## New User

If the email does not belong to a Plannity account:

1. Create pending invitation.
2. Send invitation link.
3. User opens invitation.
4. User signs up / logs in.
5. User accepts invitation.
6. Membership is created.

The invitation must survive the signup/login round trip.

---

## Invitation States

Use explicit states:

```text
pending
accepted
declined
cancelled
expired
```

Recommended expiry:

`7 days`

Make expiry configurable.

---

## Team Settings UI

Recommended route:

```text
/brands/:brandId/settings/team
```

Example:

```text
Team

5 seats
4 used

Members
-----------------------------------------
Kang               Owner
mint@example.com    Editor
design@example.com  Editor
client@example.com  Viewer

Pending invitations
-----------------------------------------
newdesign@example.com   Editor   Pending

[Invite member]
```

Available member actions depend on the current user's permissions.

---

## Brand Switcher

A user may belong to several brands.

The existing brand switcher/dashboard must show only brands where the user has an active membership or ownership.

Example:

```text
Switch brand

Bepen
Upstify
Client ABC
```

Do not expose another user's brands.

---

## Suggested Data Model

Use current project conventions if naming differs.

### BrandMembership

```ts
BrandMembership {
  id
  brandId
  userId
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  status: 'active'
  joinedAt
  createdAt
  updatedAt
}
```

Unique constraint:

```text
brandId + userId
```

A user should not have duplicate memberships in the same brand.

---

### BrandInvitation

```ts
BrandInvitation {
  id
  brandId
  email
  role
  tokenHash
  status
  invitedByUserId
  expiresAt
  acceptedByUserId?
  acceptedAt?
  createdAt
  updatedAt
}
```

Never store a raw reusable invitation token if the project security model supports hashing.

---

## Ownership

The brand creator should automatically receive:

```text
role = owner
```

Important invariants:

1. A brand must always have at least one Owner.
2. The final Owner cannot leave the brand.
3. The final Owner cannot be demoted.
4. The final Owner cannot be removed.
5. Deleting a user's account must not leave a brand ownerless.

Ownership transfer can be implemented later unless required by the current account-deletion flow.

---

## Authorization Strategy

Do not scatter raw role checks throughout UI components.

Prefer a centralized permission layer.

Example conceptual API:

```ts
can(user, 'brand.update', brandId)
can(user, 'member.invite', brandId)
can(user, 'content.create', brandId)
can(user, 'content.update', brandId)
can(user, 'content.image.upload', brandId)
```

Backend authorization is authoritative.

Frontend checks are for UX only.

Never rely solely on hiding buttons.

---

## Suggested Permission Map

Conceptual permissions:

```text
brand.read
brand.update
brand.delete

member.read
member.invite
member.updateRole
member.remove

content.read
content.create
content.update
content.delete

contentImage.read
contentImage.upload
contentImage.replace
contentImage.delete

calendar.read
```

Map these to roles centrally.

This will make later role expansion easier.

---

## API Behaviour

Follow existing API conventions.

Possible routes:

```http
GET    /api/brands/:brandId/members
POST   /api/brands/:brandId/invitations
GET    /api/brands/:brandId/invitations
POST   /api/invitations/:token/accept
POST   /api/invitations/:token/decline
POST   /api/brands/:brandId/invitations/:id/resend
DELETE /api/brands/:brandId/invitations/:id

PATCH  /api/brands/:brandId/members/:memberId
DELETE /api/brands/:brandId/members/:memberId
```

Do not expose membership mutations without brand authorization.

---

## Invite Validation

Validate:

- Valid email
- Supported role
- Inviter has permission
- Seat available
- User not already an active member
- No duplicate active pending invitation
- Brand exists
- Invitation not sent to an invalid/system account if applicable

Useful errors:

```text
This user is already a member.
An invitation has already been sent.
Your team has reached its seat limit.
You do not have permission to invite members.
```

---

## Email / Notification

If an email service already exists, send an invitation email.

Minimum information:

- Plannity
- Brand name
- Inviter
- Invited role
- Accept invitation link
- Expiry

If email infrastructure does not exist yet, keep notification sending behind an interface/service so it can be wired later.

Do not block the entire team model on building a complex notification system.

---

## Joining Behaviour

When an invitation is accepted:

1. Validate token.
2. Validate invitation is pending.
3. Validate not expired.
4. Validate current authenticated email matches invited email, unless the product explicitly permits another identity.
5. Re-check seat availability.
6. Create membership.
7. Mark invitation accepted.
8. Return/redirect to brand workspace.

The membership creation and invitation status update should be transactional where supported.

---

## Remove Member Behaviour

Owner/Admin can remove eligible members.

When removed:

- Membership becomes inactive/deleted according to project convention.
- User immediately loses brand access.
- User-created content remains.
- Uploaded images remain.
- Content ownership should not be deleted.

Do not cascade-delete content created by a removed member.

---

## Leaving a Brand

Optional but recommended if simple:

A non-final-owner member may leave a brand.

Rules:

- Viewer/Editor/Admin can leave.
- Owner can leave only if another Owner exists.
- Final Owner cannot leave.

---

## Content Attribution

If the project already tracks creators/editors, continue doing so.

Recommended metadata:

```text
createdBy
updatedBy
```

Team membership removal must not destroy historical attribution.

---

## Image Feature Compatibility

This branch must be compatible with the separate image feature branch.

Expected rule:

```text
Owner  -> can upload/remove image
Admin  -> can upload/remove image
Editor -> can upload/remove image
Viewer -> can preview/download only
```

Do not duplicate image storage logic inside Team Workspace.

Team Workspace only defines authorization.

---

## Calendar Compatibility

All active brand members can view the brand calendar.

Only roles with `content.update` permission can modify content/calendar items.

---

## Audit Metadata

At minimum, persist:

- invitedBy
- invitation createdAt
- membership joinedAt
- role
- role updatedAt if the current schema supports it

A full enterprise audit log is out of scope.

---

## Security Requirements

- Invitation tokens must be unguessable.
- Prefer hashed token storage.
- Invitations must expire.
- Validate invited email at acceptance.
- Backend must enforce every permission.
- Prevent privilege escalation.
- An Admin must not be able to make themselves Owner unless explicitly permitted.
- Prevent removal/demotion of the final Owner.
- Prevent access by manually changing brandId in URL/API.
- Membership checks must be brand-scoped.
- Rate-limit invitation sending if the project has rate-limit infrastructure.

---

## Race Conditions

Handle important concurrency cases.

Example: only one team seat remains.

Two Admins send invitations simultaneously.

Seat availability must be enforced server-side, ideally transactionally.

Similarly, invitation acceptance must re-check seat limits.

Do not trust the seat count shown in the UI.

---

## Error States

Handle at least:

- Invitation expired
- Invitation already accepted
- Invitation cancelled
- Invitation email mismatch
- Seat limit reached
- Member already exists
- Duplicate invitation
- Unauthorized role change
- Final Owner protection
- Brand not found
- Membership removed while user is viewing brand

---

## Empty State

For a Solo user:

```text
Work better together

Invite your content creator, designer, or client
to collaborate on this brand.

[Invite member]
```

If the account's current plan does not support additional members:

```text
Your current plan supports 1 member.

Upgrade to Team to invite collaborators.
```

The actual upgrade/payment action can remain disabled or link to existing pricing flow if billing is not implemented.

---

## Acceptance Criteria

The branch is complete when:

1. Brand creator automatically has Owner membership.
2. Owner can invite a member by email.
3. Owner can assign Admin, Editor, or Viewer role.
4. Pending invitation is visible.
5. Invitation can be accepted.
6. Accepted user can access only the invited brand.
7. User can belong to multiple brands.
8. Role permissions are enforced by backend.
9. Viewer cannot edit content.
10. Editor can edit content.
11. Editor permission model supports uploading/removing content images once the image branch is merged.
12. Admin can manage eligible members.
13. Final Owner cannot be removed, demoted, or leave.
14. Removed member immediately loses access.
15. Removing a member does not delete their historical content.
16. Duplicate memberships are prevented.
17. Duplicate pending invitations are prevented.
18. Expired invitations cannot be accepted.
19. Seat limit is enforced server-side.
20. Existing Solo workflow still works.

---

## Suggested Branch Name

```bash
feature/team-workspace
```

---

## Implementation Priority

### P0

- BrandMembership model
- Owner creation
- Role authorization
- Invite member
- Accept invitation
- Member list
- Remove member
- Seat validation

### P1

- Change role
- Resend invite
- Cancel invite
- Decline invite
- Invite expiry
- Leave brand

### P2 / Later

- Approver-specific workflow
- Comments
- @mentions
- Notifications center
- Activity log
- Custom roles
- Guest/client seats
- Team analytics
- Real-time collaboration

---

## Recommended Merge Strategy

This branch should be independently mergeable.

The Team branch should own:

- memberships
- invitations
- roles
- permission evaluation

The Image branch should own:

- upload
- storage
- download
- image relations

Integration point:

```text
Image feature asks:
"Can this user edit this content?"

Team feature answers through authorization.
```

Avoid importing Team-specific UI directly into image upload components.

Prefer a shared authorization/service interface.

---

## Instructions to Coding Agent

1. Inspect the current authentication, brand, content, and user models first.
2. Reuse existing project conventions.
3. Treat Brand as the collaboration boundary.
4. Do not implement organization-level complexity.
5. Centralize permissions.
6. Enforce permissions on the backend.
7. Keep frontend role checks consistent with backend permissions.
8. Protect the final Owner.
9. Add schema constraints for duplicate membership.
10. Add tests for authorization and invitation flows.
11. Keep this branch independent from `feature/content-images`.
12. Where content-image permission is referenced, integrate through generic edit/read permissions rather than image-specific hard coupling.
13. Do not change unrelated AI content-generation behaviour.
14. Do not build auto-post functionality.

---

## Definition of Done

The feature is considered done when a brand owner can invite a content creator, graphic designer, or viewer into one specific Plannity brand, each person sees only the brands they belong to, and their ability to edit content is controlled by a clear role-based permission model.
