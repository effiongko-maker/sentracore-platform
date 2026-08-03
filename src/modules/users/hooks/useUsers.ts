"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { USERS_PAGE_SIZE } from "../constants";
import { UserService } from "../services/UserService";
import type { User, UserRole, UserStatus } from "../types";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatusState] = useState<UserStatus | "all">("all");
  const [role, setRoleState] = useState<UserRole | "all">("all");
  const [facility, setFacilityState] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const requestId = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const previousSearch = useRef(debouncedSearch);

  const setStatus = useCallback((value: UserStatus | "all") => {
    setStatusState(value);
    setPage(1);
  }, []);

  const setRole = useCallback((value: UserRole | "all") => {
    setRoleState(value);
    setPage(1);
  }, []);

  const setFacility = useCallback((value: string | "all") => {
    setFacilityState(value);
    setPage(1);
  }, []);

  useEffect(() => {
    if (previousSearch.current !== debouncedSearch) {
      previousSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const fetchUsers = useCallback(
    async (nextPage = page) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await UserService.listUsers({
          page: nextPage,
          pageSize: USERS_PAGE_SIZE,
          search: debouncedSearch,
          status,
          role,
          facility,
        });

        if (id !== requestId.current) return;

        console.log("RESULT FROM API:", result);
console.log("USERS ARRAY:", result.data);

setUsers(result.data);
        setTotalPages(result.totalPages);
        setTotal(result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err instanceof Error ? err.message : "Unable to load users right now."
        );
        setUsers([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [page, debouncedSearch, status, role, facility]
  );

  useEffect(() => {
    fetchUsers(page);
  }, [fetchUsers, page]);

  const deactivateUser = useCallback(async (id: string) => {
    return UserService.deactivateUser(id);
  }, []);

  return {
    users,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    role,
    setRole,
    facility,
    setFacility,
    page,
    setPage,
    totalPages,
    total,
    reload: () => fetchUsers(page),
    deactivateUser,
  };
}
