import { describe, it, expect } from 'vitest'
import { servoDegToUrdfRad, armPoseToUrdfJoints, ARM_JOINT_MAP } from './armUrdf'

describe('servoDegToUrdfRad', () => {
  it('90 deg (neutre) -> 0 rad', () => {
    expect(servoDegToUrdfRad(90)).toBeCloseTo(0)
  })
  it('180 deg -> +pi/2', () => {
    expect(servoDegToUrdfRad(180)).toBeCloseTo(Math.PI / 2)
  })
  it('0 deg -> -pi/2', () => {
    expect(servoDegToUrdfRad(0)).toBeCloseTo(-Math.PI / 2)
  })
})

describe('armPoseToUrdfJoints', () => {
  it('mappe les 5 joints du bras sur les noms URDF', () => {
    const home = { joint1: 90, joint2: 120, joint3: 10, joint4: 20, joint5: 90 }
    const j = armPoseToUrdfJoints(home)
    expect(Object.keys(j).sort()).toEqual(Object.values(ARM_JOINT_MAP).sort())
    expect(j['arm1_Joint']).toBeCloseTo(0) // 90 -> 0
    expect(j['arm2_Joint']).toBeCloseTo((30 * Math.PI) / 180) // 120 -> +30deg
    expect(j['arm3_Joint']).toBeCloseTo((-80 * Math.PI) / 180) // 10 -> -80deg
  })
  it('garde le vrai nom URDF avec la typo arm4_Joiint', () => {
    expect(ARM_JOINT_MAP.joint4).toBe('arm4_Joiint')
  })
})
