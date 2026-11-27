# Changes in this release

- Fixed: [TimeGrid reads its populated grid before writing its sizing](registry/ouro/components/ouro/time-grid/time-grid.test.tsx "verify:testExists(registry/ouro/components/ouro/time-grid/time-grid.test.tsx::TimeGrid mount reads > measures a populated grid before writing its sizing, without another synchronous layout read)"), avoiding repeated layout during its first commit (#4052).
