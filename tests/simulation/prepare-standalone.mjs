// Local validation only: generate a disposable Next shell WITHOUT editing team root files.
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, ".standalone");
await mkdir(resolve(root, "src/app"), { recursive: true });
await mkdir(resolve(root, "tests/simulation"), { recursive: true });
await cp(resolve(here, "../../src"), resolve(root, "src"), { recursive: true });
for (const name of ["fixture.ts", "simulation.test.ts"])
  await cp(resolve(here, name), resolve(root, "tests/simulation", name));
await writeFile(
  resolve(root, "package.json"),
  JSON.stringify({
    name: "employee-demo-shell",
    private: true,
    dependencies: {
      next: "16.2.9",
      react: "19.2.7",
      "react-dom": "19.2.7",
      zustand: "5.0.14",
    },
  }),
);
await writeFile(
  resolve(root, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      isolatedModules: true,
      resolveJsonModule: true,
      plugins: [{ name: "next" }],
    },
    include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  }),
);
await writeFile(
  resolve(root, "next-env.d.ts"),
  '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
);
await writeFile(
  resolve(root, "next.config.ts"),
  `import { resolve } from 'node:path';\nexport default { turbopack: { root: resolve(__dirname, '..') }, experimental: { webpackBuildWorker: false, workerThreads: true, cpus: 1 }, devIndicators: false };\n`,
);
await writeFile(
  resolve(root, "src/app/layout.tsx"),
  `import type { ReactNode } from 'react';\nexport const metadata = { title: 'Career Quest · Employee Digital Twin' };\nexport default function Layout({children}: {children: ReactNode}) { return <html lang="ru"><body style={{margin:0}}>{children}</body></html>; }\n`,
);
await writeFile(
  resolve(root, "src/app/page.tsx"),
  `"use client";\nimport {useState} from 'react';\nimport {EmployeeStoreProvider} from '../state/EmployeeStoreProvider';\nimport {createEmployeeStore} from '../state/employeeStore';\nimport {EmployeeWorkspace} from '../components/employee/EmployeeWorkspace';\nimport {fixtureAdapter,fixtureDataset} from '../../tests/simulation/fixture';\nexport default function Demo(){ const [store]=useState(()=>{const s=createEmployeeStore(fixtureAdapter());s.getState().loadDataset(fixtureDataset());return s}); return <EmployeeStoreProvider store={store}><EmployeeWorkspace demo /></EmployeeStoreProvider>; }\n`,
);
console.log(
  "Standalone validation shell prepared in tests/simulation/.standalone",
);
