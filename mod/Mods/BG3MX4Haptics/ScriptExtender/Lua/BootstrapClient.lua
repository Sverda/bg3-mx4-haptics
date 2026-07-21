local EventFile = "BG3Haptics/ui-events.json"
local RecentEventLimit = 16
local Sequence = 0
local SessionId = ""
local RecentEvents = {}
local Cooldowns = {}
local HookedRoot = nil
local LastFocusedElement = nil

local CooldownMs = {
  ["ui.focus"] = 70,
  ["ui.activate"] = 50,
  ["ui.back"] = 100
}

local InteractiveTypeFragments = {
  "button",
  "checkbox",
  "combobox",
  "listboxitem",
  "menuitem",
  "radiobutton",
  "slider",
  "tabitem",
  "toggle"
}

local function NewSessionId()
  return "ui-" .. tostring(Ext.Timer.ClockEpoch()) .. "-" .. tostring(Ext.Timer.MonotonicTime())
end

local function WriteSnapshot()
  Ext.IO.SaveFile(EventFile, Ext.Json.Stringify({
    version = 1,
    session = SessionId,
    sequence = Sequence,
    events = RecentEvents
  }))
end

local function ResetStream()
  SessionId = NewSessionId()
  Sequence = 0
  RecentEvents = {}
  Cooldowns = {}
  LastFocusedElement = nil
  WriteSnapshot()
end

local function Emit(eventType, fields)
  Sequence = Sequence + 1

  local event = fields or {}
  event.id = SessionId .. ":" .. tostring(Sequence)
  event.type = eventType
  event.timestamp = Ext.Timer.MonotonicTime()

  table.insert(RecentEvents, event)
  while #RecentEvents > RecentEventLimit do
    table.remove(RecentEvents, 1)
  end

  WriteSnapshot()
end

local function EmitThrottled(eventType, fields)
  if Cooldowns[eventType] then
    return
  end

  Cooldowns[eventType] = true
  Emit(eventType, fields)
  Ext.Timer.WaitForRealtime(CooldownMs[eventType] or 50, function()
    Cooldowns[eventType] = nil
  end)
end

local function ReadProperty(object, name)
  if object == nil then
    return nil
  end

  local ok, value = pcall(function()
    return object[name]
  end)
  return ok and value or nil
end

local function EventSource(arguments, fallback)
  return ReadProperty(arguments, "OriginalSource")
    or ReadProperty(arguments, "Source")
    or fallback
end

local function ClassName(object)
  if object == nil then
    return ""
  end

  local ok, value = pcall(function()
    return object:GetClassTypeName()
  end)
  return ok and string.lower(tostring(value)) or ""
end

local function VisualParent(object)
  if object == nil then
    return nil
  end

  local ok, value = pcall(function()
    return object:GetVisualParent()
  end)
  return ok and value or nil
end

local function FindInteractiveControl(source, root)
  local current = source
  for _ = 1, 16 do
    if current == nil or current == root then
      return nil
    end

    local className = ClassName(current)
    for _, fragment in ipairs(InteractiveTypeFragments) do
      if string.find(className, fragment, 1, true) then
        return current, className
      end
    end

    current = VisualParent(current)
  end

  return nil
end

local function NormalizeKey(value)
  return string.lower(tostring(value or "")):gsub("[^a-z0-9]", "")
end

local function EndsWith(value, suffix)
  return suffix == "" or string.sub(value, -#suffix) == suffix
end

local function IsActivateKey(key)
  return EndsWith(key, "return")
    or EndsWith(key, "space")
    or EndsWith(key, "gamepadaccept")
end

local function IsBackKey(key)
  return EndsWith(key, "escape")
    or EndsWith(key, "gamepadcancel")
    or key == "back"
end

local function Subscribe(root, eventName, handler)
  local ok, subscription = pcall(function()
    return root:Subscribe(eventName, handler)
  end)

  if not ok or subscription == 0 then
    Ext.Utils.PrintWarning("[BG3MX4Haptics] Could not subscribe to UI event " .. eventName)
    return false
  end

  return true
end

local function AttachToRoot()
  local ok, root = pcall(Ext.UI.GetRoot)
  if not ok or root == nil then
    return false
  end

  if HookedRoot == root then
    return true
  end

  local subscribed = Subscribe(root, "PreviewMouseLeftButtonDown", function(target, arguments)
    local _, className = FindInteractiveControl(EventSource(arguments, target), root)
    if className then
      EmitThrottled("ui.activate", { input = "mouse", controlType = className })
    end
  end)

  subscribed = Subscribe(root, "GotKeyboardFocus", function(target, arguments)
    local source = EventSource(arguments, target)
    if source ~= nil and source ~= root and source ~= LastFocusedElement then
      LastFocusedElement = source
      EmitThrottled("ui.focus", { input = "keyboard-controller", controlType = ClassName(source) })
    end
  end) and subscribed

  subscribed = Subscribe(root, "PreviewKeyDown", function(_, arguments)
    local key = NormalizeKey(ReadProperty(arguments, "Key"))
    if IsBackKey(key) then
      EmitThrottled("ui.back", { input = "keyboard-controller", key = key })
    elseif IsActivateKey(key) then
      local _, className = FindInteractiveControl(LastFocusedElement, root)
      if className then
        EmitThrottled("ui.activate", {
          input = "keyboard-controller",
          key = key,
          controlType = className
        })
      end
    end
  end) and subscribed

  if not subscribed then
    return false
  end

  HookedRoot = root
  Ext.Utils.Print("[BG3MX4Haptics] Client UI haptics ready")
  return true
end

local function AttachWithRetry()
  if not AttachToRoot() then
    Ext.Timer.WaitForRealtime(500, AttachWithRetry)
  end
end

ResetStream()
AttachWithRetry()

Ext.Events.GameStateChanged:Subscribe(function()
  Ext.Timer.WaitForRealtime(100, AttachWithRetry)
end)

Ext.Events.SessionLoaded:Subscribe(function()
  ResetStream()
  Ext.Timer.WaitForRealtime(100, AttachWithRetry)
end)
