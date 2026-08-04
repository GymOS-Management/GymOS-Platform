# GymOS-Platform

The GymOS **control-plane service**: Super Admin, gyms/tenants, subscriptions, billing,
platform users, feature flags, settings, and monitoring. `.NET 10 / PostgreSQL`,
built as a modular monolith per the frozen architecture
([GymOS-Specification](../GymOS-Specification), service boundary per **ADR-51**).

## Layout

```
GymOS.Platform.slnx
Directory.Build.props        # quality gates: nullable, warnings-as-errors, analyzers
Directory.Packages.props     # Central Package Management — the dependency audit point
docs/Engineering/            # DEPENDENCY_POLICY.md — changes with its enforcing test
src/
  BuildingBlocks/            # SharedKernel + Application/Infrastructure building blocks
                             #   (published as NuGet when GymOS-Backend starts — ADR-51)
  Platform/                  # Domain / Application / Infrastructure vertical
  Modules/                   # platform-scope modules land here per milestone
  Host/GymOS.WebApi/         # composition root
tests/
  GymOS.ArchitectureTests/   # dependency + package law; runs on every build
```

## Build & test

```
dotnet build GymOS.Platform.slnx
dotnet test  GymOS.Platform.slnx
dotnet run   --project src/Host/GymOS.WebApi     # http://localhost:5080/health/live
```

## Rules

- Architecture is frozen — see GymOS-Specification; deviations need an ADR there first.
- Dependencies are allowlisted — see `docs/Engineering/DEPENDENCY_POLICY.md`; the policy
  document and `ForbiddenPackagesTests` change together, in the same commit.
- New projects must be declared in the `ProjectReferenceTests` rule table or the build fails.
