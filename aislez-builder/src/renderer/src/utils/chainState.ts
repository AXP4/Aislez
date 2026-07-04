let _detaching = false
let _timer: ReturnType<typeof setTimeout> | null = null

export function flagDetaching(): void {
  _detaching = true
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(() => { _detaching = false; _timer = null }, 300)
}

export function isDetaching(): boolean {
  return _detaching
}
