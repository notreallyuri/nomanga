import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/read/$sourceId/$mangaId/$chapterId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/read/$sourceId/$mangaId/$chapterId"!</div>
}
