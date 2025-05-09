# Φ Phi

A dashboard for FluxCD _heavily_ inspired by [ArgoCD](https://argoproj.github.io/cd/).

This project began as a hands-on experiment with Go and over time, it transformed to this dashboard after some head bashing with flux and my homelab cluster.

This works for my cluster and my setup, however it may struggle with other configurations and versions...

__THIS IS NOT PRODUCTION READY__

If you want to try it out beware: many bugs are to be expected.
Code is not optimized, nor fully tested.

![img](./docs/dashboard.png)

![img](./docs/tree.png)

# Features

- [X] Show sync status
- [X] Show conditions
- [X] Show ownership tree
- [X] Manually sync
- [X] Manually Suspend/Resume sync
- [X] Show object events and all events
- [X] Show Pod logs
- [X] Filter by Kind, Status

# Backlog (for v1)

- [ ] Ability to filter events (regression)
- [ ] Search bars (regression)
- [ ] Persist selections in session storage
- [ ] Add symbol in the UI to show resources about to be deleted and finalizers
- [ ] Handle more information which are resource specific (e.g. used space of a volume, TBD)
- [ ] Allow for some resource specific actions (e.g. delete a pod, TBD)
- [ ] Code Cleanup
- [ ] Unit / Integration tests
- [ ] Actual error handling in backend
- [ ] Resync backend periodically
- [ ] Finish redesign

# Local Development

Prerequisites:

* go (1.22.6)
* node (20.15.1)
* yarn (1.22.22)

## Frontend

```
cd web
yarn
```

### Set the `./web/.env` file values

```
VITE_VERSION=local
VITE_URL=http://localhost:8080
VITE_WS=http://localhost:8080/ws
```

## Backend

```
cd backend
go mod tidy
go mod download
```

### VSCode

Simply run the `Local Dev Suite`

# Acknowledgments

* [Capacitor](https://github.com/gimlet-io/capacitor) - As a source for learning how to interact with flux and kubernetes in go
* [xyflow/react](https://reactflow.dev/) - Great node diagram visualization library
* [kubectl-tree](https://github.com/ahmetb/kubectl-tree) - Kubectl plugin to explore ownership relationshipts between kubernetes objects. Some code was directly taken from this project
