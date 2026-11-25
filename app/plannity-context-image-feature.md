# Plannity — Image Attachment Feature Context

## Purpose

This document is the implementation context for a dedicated feature branch that adds **image attachment support to content posts** in Plannity.

The feature is intentionally simple for the current MVP:

- A content item can have one or more uploaded images.
- Images are stored with that content item.
- Users can preview attached images.
- Users can download images when it is time to publish the post.
- Users can replace or remove images.
- No AI image generation is required.
- No automatic social posting is required.
- No advanced asset library is required in this branch.

This feature should reduce the manual step of searching for the correct image outside Plannity when a scheduled post is ready.

---

## Product Context

Plannity is a creative planning workspace for marketers, content creators, agencies, and small teams.

A typical content item already contains or may contain:

- Brand
- Planned publish date
- Platform
- Content pillar
- Marketing objective
- Concept
- Hook
- Caption
- CTA
- Visual brief
- Workflow status

This feature adds the actual visual file(s) used for publishing.

The goal is:

`Plan -> Caption -> Upload Image -> Ready to Post -> Download Image -> Copy Caption -> Publish manually`

---

## Scope

### In Scope

1. Upload image files to a content item.
2. Support multiple images per content item.
3. Show image thumbnails in the content detail/editor.
4. Show image availability in calendar/list views.
5. Download an individual image.
6. Download all attached images for one content item.
7. Replace an uploaded image.
8. Remove an uploaded image.
9. Save image metadata.
10. Validate file type and file size.
11. Restrict image mutations to users who already have permission to edit the content item.
12. Keep the feature compatible with a future Team Workspace feature.

### Out of Scope

Do not implement the following in this branch:

- AI image generation
- Image editing
- Background removal
- Automatic resizing/cropping
- Design templates
- Canva integration
- Google Drive integration
- Global media library
- Asset tagging
- Semantic image search
- Social media auto-posting
- Approval workflow changes
- Team invitation or role management

---

## Primary User Stories

### Upload

As a content creator, I want to upload the final image to a content item so that everything needed for publishing is stored in one place.

### Review

As a user, I want to preview the uploaded images before publishing so that I can confirm that the correct visual is attached.

### Publish Manually

As a user, I want to download the image from the content item and copy the caption so that I can manually publish it to the target social platform.

### Replace

As a user, I want to replace an incorrect image without recreating the content item.

### Remove

As a user, I want to remove an image that is no longer required.

---

## UX Requirements

### Content Editor

Add a section named:

`Post Images`

Recommended layout:

- Upload area
- Existing image thumbnails
- Image filename
- File size
- Upload date
- Download action
- Replace action
- Remove action

Example:

```text
Post Images

[ + Upload images ]

┌──────────────────┐
│    thumbnail     │
│                  │
└──────────────────┘

baoke-back-to-school.jpg
1.8 MB

[Download] [Replace] [Remove]
```

When multiple images exist:

```text
Post Images (3)

[image 1] [image 2] [image 3]

[Download all]
```

The upload area may support drag-and-drop, but drag-and-drop must not be the only upload method.

---

## Calendar / Content List Indicators

Do not display full images in every calendar cell.

Use a small visual indicator instead.

Examples:

```text
📷 2 images
```

or

```text
Image ✓
```

If there is no image:

```text
No image
```

The indicator should help users identify posts that still need a visual.

Do not automatically change the content workflow status solely because an image was uploaded.

---

## Ready-to-Post Experience

When viewing a content item that has a caption and at least one image, show a simple publishing helper section:

```text
Ready to post

[Copy caption]
[Download image]
```

For multiple images:

```text
[Copy caption]
[Download all images]
```

Do not open or post to social platforms in this branch.

---

## Supported File Types

Initial MVP support:

- JPEG / JPG
- PNG
- WEBP

Optional if already supported by the existing upload infrastructure:

- GIF

Do not support arbitrary documents in this image field.

---

## File Size

Recommended initial limit:

`10 MB per image`

Make the limit configurable instead of hardcoding it in UI-only logic.

The backend must enforce the same limit.

---

## Image Count

Recommended initial limit:

`10 images per content item`

Make this configurable.

The UI should clearly show an error when the limit is exceeded.

---

## Suggested Data Model

Use the existing project's conventions if they differ from this example.

### Content

Existing content entity.

Add a relation:

```text
content.images -> many media/assets
```

### ContentImage

If the project requires a dedicated entity instead of using the CMS media object directly:

```ts
ContentImage {
  id
  contentId
  fileId
  filename
  mimeType
  size
  width
  height
  sortOrder
  uploadedBy
  createdAt
  updatedAt
}
```

Do not duplicate binary data inside PostgreSQL if the existing upload/storage layer already manages files.

---

## Storage

Follow the existing storage configuration of the project.

Preferred abstraction:

```text
Application
    ->
Upload Service
    ->
Storage Provider
```

The feature should not depend directly on a specific provider.

This keeps future migration possible between:

- local storage
- S3-compatible storage
- Cloudflare R2
- other object storage

If the current project only has local storage, local storage is acceptable for MVP.

---

## API Behaviour

Use existing API conventions.

Suggested endpoints if custom endpoints are required:

```http
POST   /api/contents/:contentId/images
GET    /api/contents/:contentId/images
DELETE /api/contents/:contentId/images/:imageId
POST   /api/contents/:contentId/images/:imageId/replace
GET    /api/contents/:contentId/images/:imageId/download
GET    /api/contents/:contentId/images/download
```

If Strapi Media Library relations already cover this cleanly, prefer the native media API and relation handling rather than creating unnecessary endpoints.

---

## Upload Response

The frontend should receive enough information to immediately render the uploaded image:

```json
{
  "id": "image-id",
  "filename": "baoke-back-to-school.jpg",
  "mimeType": "image/jpeg",
  "size": 1834021,
  "url": "...",
  "thumbnailUrl": "...",
  "width": 1080,
  "height": 1350,
  "createdAt": "..."
}
```

Use actual existing project types and naming conventions.

---

## Permissions

This branch should not introduce the Team roles themselves.

Instead, image actions must reuse the existing content authorization boundary.

Rule:

> If the current user can edit a content item, the current user can upload, replace, reorder, and remove its images.

If the current user can only view content, images may be previewed/downloaded but not mutated.

This rule is deliberately compatible with the future Team Workspace branch.

---

## Error States

Handle at least:

- Unsupported file type
- File too large
- Too many images
- Upload failed
- Network interrupted
- Image removed by another session
- Content not found
- Unauthorized upload
- Unauthorized removal
- Storage provider error

Do not silently fail.

The UI should explain what happened and allow retry when appropriate.

---

## Loading Behaviour

While uploading:

- Show progress if available.
- Disable repeated submission for the same file.
- Do not block editing unrelated fields.
- Keep already uploaded images visible.

---

## Delete Behaviour

Removing an image from a content item should:

1. Confirm destructive action.
2. Remove the relation.
3. Delete the underlying storage object only if it is not shared elsewhere.

If the media object can be referenced by multiple records, do not delete the binary file unless safe.

---

## Replace Behaviour

Replacing an image should preserve its logical position in the content item.

Example:

```text
Image #2
old.jpg
    ↓ Replace
new.jpg
```

After replacement, the UI should still display it as image #2.

---

## Ordering

Allow images to have a stable order.

MVP options:

- simple move left / move right buttons, or
- drag-and-drop with accessible fallback controls.

The first image may be treated as the primary image visually, but do not build additional business logic around this yet.

---

## Security Requirements

- Validate MIME type server-side.
- Do not rely only on filename extension.
- Generate safe storage filenames.
- Prevent path traversal.
- Prevent direct access to private files if the project requires authenticated media.
- Enforce authorization on mutations.
- Do not expose internal server paths.
- Sanitize metadata returned to the frontend.

---

## Performance

- Generate/use thumbnails when the media stack supports them.
- Avoid loading original full-resolution images in dense calendar/list views.
- Lazy-load preview thumbnails where practical.
- Do not fetch all original image binaries when loading the calendar.

---

## Analytics Events

If the project already has analytics/event tracking, add:

```text
content_image_uploaded
content_image_removed
content_image_replaced
content_image_downloaded
content_images_downloaded_all
```

Do not introduce a new analytics platform solely for this feature.

---

## Acceptance Criteria

The branch is complete when:

1. A user can open an existing content item.
2. The user can upload at least one JPG/PNG/WEBP image.
3. The uploaded image remains associated after refresh.
4. Multiple images can be attached.
5. The user can preview each image.
6. The user can download each image.
7. The user can download all images for one content item.
8. The user can replace an image.
9. The user can remove an image.
10. Invalid file types are rejected.
11. Oversized files are rejected.
12. Unauthorized users cannot mutate image attachments.
13. Calendar/list UI indicates whether content has images without loading full-resolution files.
14. Existing content-generation and calendar functionality still works.
15. No AI generation or auto-post functionality is added.

---

## Suggested Branch Name

```bash
feature/content-images
```

---

## Implementation Priority

### P0

- Upload
- Persist relation
- Preview
- Download
- Remove
- Authorization
- Validation

### P1

- Multiple images
- Download all
- Replace
- Ordering
- Calendar image indicator

### P2 / Later

- Global asset library
- Product image library
- AI image generation
- Auto-tagging
- Auto-resize
- Image templates
- Social publishing

---

## Instructions to Coding Agent

1. Read the current project structure before implementing.
2. Reuse existing authentication, authorization, media upload, API, UI component, and storage conventions.
3. Do not redesign unrelated modules.
4. Do not implement features listed under Out of Scope.
5. Keep schema changes backward-compatible where practical.
6. Add migrations/schema updates required by the project's stack.
7. Add backend validation, not only frontend validation.
8. Add tests for critical upload and authorization flows.
9. Ensure the branch can be merged independently from the Team Workspace branch.
10. If the Team branch is merged later, image permissions should work through the shared content-edit permission model without requiring a rewrite.

---

## Definition of Done

The feature is considered done when a normal Plannity user can create or open a content item, attach the final post image(s), return later, and download those exact files at publishing time without searching outside Plannity.
