import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/browse/$sourceId")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_app/browse/$sourceId"!</div>;
}
