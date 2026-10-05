/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-frontend-to-backend-leak',
      comment: 'Frontend UI components must never directly import server, database, or backend logic.',
      severity: 'error',
      from: {
        path: '^(src/)?(app|pages|components|ui)/',
      },
      to: {
        path: '^(src/)?(server|backend|prisma|db|api/backend)/',
      },
    },
    {
      name: 'no-backend-to-frontend-leak',
      comment: 'Backend services and domain logic must never import React components or UI views.',
      severity: 'error',
      from: {
        path: '^(src/)?(server|backend|services|use-cases|domain)/',
      },
      to: {
        path: '^(src/)?(app|pages|components|ui)/',
      },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies break bundlers and cause runtime undefined exports.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'not-to-unlisted',
      comment: 'Imports from packages not explicitly declared in package.json are forbidden (anti-hidden-bloat).',
      severity: 'error',
      from: {},
      to: {
        dependencyTypes: ['npm-no-pkg', 'npm-unknown'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
