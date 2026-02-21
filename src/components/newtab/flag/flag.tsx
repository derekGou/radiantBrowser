import ClipDefs from "./clipdefs";

interface props {
    title: string,
    image: string,
    size : number
}

export default function Flag({title, image, size} : props){
    return (
        <>
            <ClipDefs/>
            <div style={{
                clipPath: "url(#flagClip)",
            }} className="group relative flex items-center justify-center brightness-90 hover:brightness-110 cursor-pointer">
                <img style={{
                    height: size + "rem",
                }} src="/assets/flag.svg" draggable="false" className={`relative z-30`}/>
                <div style={{ 
                    clipPath: "url(#flagClip)",
                    width: (0.4 * size) + "rem",
                    height: size + "rem",
                }} className={`z-20 absolute flex items-center justify-center bg-[#fff0] group-hover:bg-[#fff2]`}
                >
                    <img draggable="false" src={`/assets/cards/${image}`} className="w-full h-full object-cover fade"/>
                </div>
                <div style={{
                    height: `${26/3}%`,
                    width: (0.4 * size) + "rem",
                }} className={`z-30 absolute top-[60%] flex items-center justify-center no-wrap overflow-hidden px-2 w-[${0.4 * size}rem]`}>
                    <h4>{title}</h4>
                </div>
            </div>
        </>
    )
}