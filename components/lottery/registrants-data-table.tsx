"use client";

import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IconSearch, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { Registrant } from "@/lib/types";

interface RegistrantsDataTableProps {
  registrants: Registrant[];
}

const ITEMS_PER_PAGE = 10;

export function RegistrantsDataTable({ registrants }: RegistrantsDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<"name" | "email" | "enteredAt">("enteredAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Filter registrants based on search query
  const filteredRegistrants = useMemo(() => {
    if (!searchQuery) return registrants;

    const query = searchQuery.toLowerCase();
    return registrants.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.email.toLowerCase().includes(query)
    );
  }, [registrants, searchQuery]);

  // Sort registrants
  const sortedRegistrants = useMemo(() => {
    const sorted = [...filteredRegistrants];
    sorted.sort((a, b) => {
      let aVal, bVal;

      if (sortColumn === "enteredAt") {
        aVal = new Date(a.enteredAt).getTime();
        bVal = new Date(b.enteredAt).getTime();
      } else {
        aVal = a[sortColumn].toLowerCase();
        bVal = b[sortColumn].toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredRegistrants, sortColumn, sortDirection]);

  // Paginate registrants
  const totalPages = Math.ceil(sortedRegistrants.length / ITEMS_PER_PAGE);
  const paginatedRegistrants = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return sortedRegistrants.slice(start, end);
  }, [sortedRegistrants, currentPage]);

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIndicator = (column: typeof sortColumn) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>All Registrants</CardTitle>
            <CardDescription>
              {filteredRegistrants.length} {filteredRegistrants.length === 1 ? "registrant" : "registrants"}
              {searchQuery && ` matching "${searchQuery}"`}
            </CardDescription>
          </div>
          <div className="relative max-w-xs">
            <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1); // Reset to first page on search
              }}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paginatedRegistrants.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              {searchQuery
                ? `No registrants found matching "${searchQuery}"`
                : "No registrants for today yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted sticky top-0 z-10">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted-foreground/10"
                      onClick={() => handleSort("name")}
                    >
                      Name{getSortIndicator("name")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted-foreground/10"
                      onClick={() => handleSort("email")}
                    >
                      Email{getSortIndicator("email")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer text-right hover:bg-muted-foreground/10"
                      onClick={() => handleSort("enteredAt")}
                    >
                      Entered At{getSortIndicator("enteredAt")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRegistrants.map((registrant, index) => {
                    const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                    return (
                      <TableRow key={registrant._id?.toString()}>
                        <TableCell className="font-medium text-muted-foreground">
                          {globalIndex}
                        </TableCell>
                        <TableCell className="font-medium">{registrant.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {registrant.email}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatTime(registrant.enteredAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <IconChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <IconChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
