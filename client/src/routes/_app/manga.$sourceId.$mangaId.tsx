import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/manga/$sourceId/$mangaId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_app/manga/$sourceId/$mangaId"!</div>
}
