"use client"

import { UserButton, useUser } from "@clerk/nextjs"
import {
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavUser() {
  const { user } = useUser()

  if (!user) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex min-h-12 w-full items-center gap-2 rounded-md p-2 text-left text-sm">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8 rounded-lg",
              },
            }}
          />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">
              {user.fullName ?? user.primaryEmailAddress?.emailAddress}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {user.primaryEmailAddress?.emailAddress}
            </span>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
