import { useEffect } from 'react'
import { sounds } from '@/lib/sounds'
import { notify, askPermission } from '@/lib/notifications'

// Hook global a monter dans App. Subscribe au store WS legacy pour declencher
// sons + notifs sur mission_completed / robot_offline / robot_online.
// On ne peut pas s'abonner aux WS direct (singleton interne) — on observe
// les changements de store via subscribeWithSelector.

import { useRobotStore } from '@/stores/robotStore'

export function useGlobalEffects(): void {
  useEffect(() => {
    void askPermission()
  }, [])

  // surveiller status robot
  useEffect(() => {
    let prevStatus = useRobotStore.getState().status
    let prevConnected = useRobotStore.getState().connected
    const unsub = useRobotStore.subscribe((state) => {
      if (state.status !== prevStatus) {
        if (state.status === 'OFFLINE' && prevStatus !== 'OFFLINE') {
          sounds.alert()
          notify('Robot deconnecte', 'Le robot ne repond plus', { tag: 'robot-status' })
        } else if (state.status === 'AVAILABLE' && prevStatus === 'OFFLINE') {
          sounds.success()
          notify('Robot reconnecte', 'Le robot est revenu en ligne', { tag: 'robot-status' })
        } else if (state.status === 'ERROR') {
          sounds.alert()
          notify('Erreur robot', 'Le robot est en etat ERROR', { tag: 'robot-status' })
        }
        prevStatus = state.status
      }
      if (state.connected !== prevConnected) {
        if (!state.connected) sounds.beep()
        prevConnected = state.connected
      }
    })
    return () => unsub()
  }, [])
}
