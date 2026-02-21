import { Dispatch, SetStateAction } from "react";

export default function OnOff({ on, setOn }: { on: boolean, setOn: Dispatch<SetStateAction<boolean>> }){
    return (
        <>
            <div className="flex flex-row">
                <div onClick = {()=>{setOn(true)}} className={`p-4 flex-1 cursor-pointer ${on ? 'bg-[#fff6]' : 'bg-[#fff1] hover:bg-[#fff3]'}`}>
                    <p className="text-white text-center">On</p>
                </div>
                <div onClick = {()=>{setOn(false)}} className={`p-4 flex-1 cursor-pointer ${on ? 'bg-[#fff1] hover:bg-[#fff3]' : 'bg-[#fff6]'}`}>
                    <p className="text-white text-center">Off</p>
                </div>
            </div>
        </>
    )
}