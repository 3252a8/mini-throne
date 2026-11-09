package xray

import (
	"context"
	"encoding/json"
	"time"

	"github.com/xtls/xray-core/app/observatory"
	"github.com/xtls/xray-core/core"
	"github.com/xtls/xray-core/features/extension"
	"github.com/xtls/xray-core/features/outbound"
)

// AwaitRouting gives a fresh full-config balancer its first observation before a
// latency request. Call only after the sing-box DNS bridge is available: Xray's
// automatic initial check can run before that bridge and fail every candidate.
// The subscription's routing, selectors and observation settings stay unchanged.
func AwaitRouting(ctx context.Context, instance *core.Instance, config string) {
	var options struct {
		Routing struct {
			Balancers []json.RawMessage `json:"balancers"`
		} `json:"routing"`
		Burst *struct {
			Selectors []string `json:"subjectSelector"`
		} `json:"burstObservatory"`
		Observer *struct {
			Selectors []string `json:"subjectSelector"`
		} `json:"observatory"`
	}
	if json.Unmarshal([]byte(config), &options) != nil || len(options.Routing.Balancers) == 0 {
		return
	}
	observer, ok := instance.GetFeature(extension.ObservatoryType()).(extension.Observatory)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if burst, ok := observer.(extension.BurstObservatory); ok && options.Burst != nil {
		selector, ok := instance.GetFeature(outbound.ManagerType()).(outbound.HandlerSelector)
		if !ok {
			return
		}
		tags := selector.Select(options.Burst.Selectors)
		if len(tags) == 0 {
			return
		}
		done := make(chan struct{})
		go func() { burst.Check(tags); close(done) }()
		select {
		case <-done:
		case <-ctx.Done():
		}
		return
	}
	if options.Observer == nil || len(options.Observer.Selectors) == 0 {
		return
	}
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		result, err := observer.GetObservation(ctx)
		if observations, ok := result.(*observatory.ObservationResult); err == nil && ok {
			for _, status := range observations.Status {
				if status.Alive {
					return
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
