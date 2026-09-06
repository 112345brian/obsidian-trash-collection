# Changesets

Create a changeset for every user-visible change:

```sh
npx changeset
```

Choose `patch` for fixes, `minor` for backwards-compatible features, and
`major` for breaking changes. Commit the generated `.changeset/*.md` file with
the implementation.

To prepare a release, first verify the pending changes with
`npx changeset status`, then run `npx changeset version`. Commit the resulting
version and changelog changes separately, create an annotated `v<version>` tag,
and push the commit and tag.
