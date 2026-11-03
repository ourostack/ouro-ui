"use client";

import { useCallback, useSyncExternalStore } from "react";
import { unknownPerson, type PeopleCache, type PersonEntry } from "@/registry/ouro/lib/ouro/people-cache";

const ignore = () => () => {};

/**
 * One person from a cache made with `createPeopleCache`, for a component that shows them, such as
 * an avatar or a message's author: their entry, read while the component shows it and again
 * whenever it runs out. Pass `null` or `undefined` while the id is not known; the entry is then
 * `unknown`, and nothing is read. The server renders the `unknown` entry, and so does hydration,
 * before the cache's entry replaces it.
 *
 * @group Chat
 *
 * @example
 * const photo = usePerson(photos, message.authorId);
 * const name = usePerson(names, message.authorId);
 * return <Avatar name={name.value ?? message.authorName} src={photo.value} />;
 */
export function usePerson<T>(cache: PeopleCache<T>, id: string | null | undefined): PersonEntry<T> {
  const subscribe = useCallback((onChange: () => void) => cache.watch(id!, onChange), [cache, id]);
  return useSyncExternalStore(id ? subscribe : ignore, () => (id ? cache.get(id) : unknownPerson), () => unknownPerson);
}
