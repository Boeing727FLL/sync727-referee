import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAM_STORAGE_KEY, createTeam, getActiveTeamId, joinTeam, subscribeTeamMembers, subscribeTeamQuestions, type TeamMember, type TeamQuestion, type TeamWorkspace } from '../../../services/teamWorkspaceService';
export function useTeamWorkspace(isOpen:boolean,currentUser:TeamMember,onTeamChange:(team:TeamWorkspace|null)=>void){
 const [team,setTeam]=useState<TeamWorkspace|null>(null); const [members,setMembers]=useState<TeamMember[]>([]); const [questions,setQuestions]=useState<TeamQuestion[]>([]); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState(''); const timer=useRef<number|null>(null);
 const notify=useCallback((message:string)=>{setNotice(message);if(timer.current)clearTimeout(timer.current);timer.current=window.setTimeout(()=>setNotice(''),2200);},[]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 useEffect(()=>{if(!isOpen)return;const id=getActiveTeamId();if(!id)return;joinTeam(id,currentUser).then(value=>{if(value)setTeam(value);}).catch(()=>undefined);},[isOpen,currentUser.uid]);
 useEffect(()=>{if(!team)return;const a=subscribeTeamQuestions(team.id,setQuestions),b=subscribeTeamMembers(team.id,setMembers);return()=>{a();b();};},[team]);
 const open=(value:TeamWorkspace)=>{localStorage.setItem(TEAM_STORAGE_KEY,value.id);setTeam(value);onTeamChange(value);};
 const create=async(name:string)=>{if(!name.trim())return false;setBusy(true);try{open(await createTeam(name,currentUser));return true;}catch(error){notify(error instanceof Error?error.message:'לא הצלחתי ליצור את הקבוצה. נסו שוב.');return false;}finally{setBusy(false);}};
 const join=async(code:string)=>{if(!code.trim())return false;setBusy(true);try{const value=await joinTeam(code,currentUser);if(!value){notify('לא נמצאה קבוצה עם הקוד הזה.');return false;}open(value);return true;}catch(error){notify(error instanceof Error?error.message:'לא הצלחתי להצטרף לקבוצה. נסו שוב.');return false;}finally{setBusy(false);}};
 const leave=()=>{localStorage.removeItem(TEAM_STORAGE_KEY);setTeam(null);setMembers([]);setQuestions([]);onTeamChange(null);};
 return{team,members,questions,busy,notice,notify,create,join,leave};
}
