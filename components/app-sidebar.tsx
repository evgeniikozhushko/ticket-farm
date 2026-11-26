"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconChartBar,
  IconExternalLink,
  IconListDetails,
  IconSettings,
  IconTicket,
  IconUsers,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const data = {
  navMain: [
    {
      title: "Lottery",
      url: "/dashboard/lottery",
      icon: IconTicket,
    },
    {
      title: "Analytics",
      url: "#",
      icon: IconChartBar,
    },
    {
      title: "Participants",
      url: "/dashboard/participants",
      icon: IconUsers,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/org/settings",
      icon: IconSettings,
    },
    {
      title: "Billing",
      url: "/billing",
      icon: IconListDetails,
    },
  ],
}

export function AppSidebar({
  isAdmin,
  publicSlug,
  ...props
}: React.ComponentProps<typeof Sidebar> & { isAdmin: boolean; publicSlug?: string | null }) {
  const { setOpenMobile } = useSidebar()
  const secondaryItems: React.ComponentProps<typeof NavSecondary>["items"] = []

  if (publicSlug) {
    secondaryItems.push({
      title: "Public page",
      url: `/${publicSlug}`,
      icon: IconExternalLink,
      external: true,
    })
  }
  if (isAdmin) {
    secondaryItems.push(...data.navSecondary)
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                <IconTicket className="!size-5" />
                <span className="text-base font-semibold">Ticket Farm</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {secondaryItems.length > 0 && <NavSecondary items={secondaryItems} className="mt-auto" />}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
