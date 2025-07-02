package kubernetes

type FluxService interface {
	// Reconcile reconciles a FluxCD resource by patching it with a reconcile request annotation.
	Reconcile(el Resource) (*Resource, error)
	// Suspend suspends a FluxCD resource by patching it with a suspend annotation.
	Suspend(el Resource) (*Resource, error)
	// Resume resumes a suspended FluxCD resource by patching it with the suspend field set to false.
	Resume(el Resource) (*Resource, error)
}
