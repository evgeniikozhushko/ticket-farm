import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function TicketPage({ params }: { params: { id: string } }) {
	const today = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	})

	const generatedTime = new Date().toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	})

	// Mock ticket data (in real app, fetch based on params.id)
	const ticket = {
		number: "027",
		id: "938271",
		pickupTime: "5:30 PM",
		theme: "Strawberry",
		themeEmoji: "🍓",
		location: "Shepherd of the Valley Lutheran Church (near Hospital), 1205 - 1st Ave, Canmore.",
	}

	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
				{/* Header */}
				<header className="mb-8 mt-14 text-center">
					<div className="mb-2 flex items-center justify-center gap-2">
						<h1 className="text-4xl font-bold text-foreground">Canmore Food Recovery Barn</h1>
					</div>
					<p className="text-med font-medium text-muted-foreground uppercaseb"></p>
				</header>

				{/* Digital Ticket */}
				<div className="rounded-sm bg-card p-6 shadow-2xl sm:p-8 border">

					<div className="flex items-center justify-between gap-6 mb-8">
						{/* Ticket Details */}
						<div className="space-y-6 text-center flex-2">
							<div>
								<p className="mb-2 text-sm font-medium text-muted-foreground">Ticket Number</p>
								<p className="text-5xl font-bold text-primary">#{ticket.number}</p>
							</div>

							<div className="rounded-sm bg-secondary p-4">
								<p className="mb-1 text-xs font-medium text-muted-foreground">Ticket ID</p>
								<p className="font-mono text-2xl font-semibold tracking-wider text-foreground">{ticket.id}</p>
							</div>
						</div>
						
						{/* Theme Visual */}
						<div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-accent/10 py-12 flex-1">
							<div className="text-4xl drop-shadow-sm" role="img" aria-label={ticket.theme}>
								{ticket.themeEmoji}
							</div>
							<div className="text-center">
								<p className="text-sm font-medium text-muted-foreground uppercase">{"Today's Theme"}</p>
								<p className="text-2xl font-bold text-foreground">{ticket.theme}</p>
							</div>
						</div>
					</div>



					{/* Pickup Information */}
					<div className="mb-8 space-y-4 rounded-sm bg-primary/5 p-6">
						<h3 className="text-start text-lg font-bold text-foreground">Pickup Details</h3>

						<div className="space-y-3 text-start">
							<div>
								<p className="text-sm text-muted-foreground">Pickup Time</p>
								<p className="text-xl font-bold text-primary">{ticket.pickupTime}</p>
							</div>

							<div>
								<p className="text-sm text-muted-foreground">Date</p>
								<p className="text-sm font-medium text-foreground">{today}</p>
							</div>

							<div>
								<p className="text-sm text-muted-foreground">Location</p>
								<p className="text-sm  text-balance font-medium text-foreground">{ticket.location}</p>
							</div>
						</div>
					</div>

					{/* Instructions */}
					<div className="mb-6 space-y-3 rounded-lg bg-secondary/50 p-5">
						<h4 className="font-semibold text-foreground">Instructions:</h4>
						<ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>Show this screen at the door</span>
							</li>
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>Please arrive during your scheduled pickup time</span>
							</li>
							<li className="flex gap-2">
								<span className="text-primary">•</span>
								<span>Please BYO bag</span>
							</li>
						</ul>
					</div>

					{/* Metadata */}
					

					{/* Cancel Button */}
					<Button variant="outline" className="w-full bg-transparent" size="lg" asChild>
						<Link href="/ticket/cancel">Cancel this ticket</Link>
					</Button>
				</div>

				{/* Footer */}
				<footer className="mt-8 text-center text-sm text-muted-foreground">
					<p>Canmore Food Recovery Program</p>
					<p className="mt-2">
						Questions?{" "}
						<a href="mailto:info@canmorefoodrecovery.org" className="underline">
							Contact us
						</a>
					</p>
				</footer>
			</div>
		</div>
	)
}
